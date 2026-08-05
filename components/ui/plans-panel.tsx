'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  CalendarDays,
  Navigation,
  Ticket,
  Trash2,
  Clock,
  Share2,
  Check,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
} from 'lucide-react';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { useTravelEstimate } from '@/hooks/use-travel';
import { describeAllowance, formatLeaveAt, planLeaveBy } from '@/lib/travel';
import {
  directionsUrl,
  googleCalendarUrl,
  planToIcs,
  prefersNativeCalendarHandoff,
  type Plan,
} from '@/lib/plans';
import { shareScreening } from '@/lib/share';
import { saveTicket, getTicket, deleteTicket, TicketStorageError } from '@/lib/tickets';
import { cn, formatBytes, formatDayLabel, formatMinutes, formatShowtime, formatPrice } from '@/lib/utils';

/**
 * My plans — the other half of "Leave by".
 *
 * Saving a showtime used to do nothing; the tab existed and was empty. A plan
 * now carries the whole decision: when it starts, when to leave given traffic,
 * how to get there, and where the ticket is.
 *
 * Plans live in this browser only. There are no accounts and no server, so the
 * UI says that rather than letting someone discover it when they pick up their
 * phone instead of their laptop.
 */
export function PlansPanel() {
  const plans = useDiscoveryStore((s) => s.plans);

  const sorted = useMemo(
    () => [...plans].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)),
    [plans],
  );

  if (!sorted.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Clock className="h-6 w-6 text-muted" />
        <p className="text-[13px] text-muted">
          No plans yet. Tap <span className="text-ink">Plan it</span> on any showtime and it
          lands here — with the time to leave, directions, and a spot to attach your ticket
          once you've booked, so it's not buried in an email.
        </p>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
      <ul className="space-y-2.5">
        {sorted.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </ul>
      <p className="px-1 pt-4 text-center text-[11px] text-muted">
        Plans are stored on this device only.
      </p>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const removePlan = useDiscoveryStore((s) => s.removePlan);
  const setPlanTicket = useDiscoveryStore((s) => s.setPlanTicket);

  // Re-render every 30s so the countdown is a countdown rather than a value
  // frozen at whatever it was when the tab was opened.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const departAt = useMemo(() => {
    const rough = new Date(Date.parse(plan.startTime) - 60 * 60_000);
    return rough.getTime() > Date.now() ? rough : new Date();
  }, [plan.startTime]);

  const estimate = useTravelEstimate(
    userCoords,
    { lat: plan.cinemaLat, lng: plan.cinemaLng },
    userCoords ? departAt : null,
  );

  const leave = estimate ? planLeaveBy(plan.startTime, estimate) : null;
  const startsIn = Math.round((Date.parse(plan.startTime) - Date.now()) / 60_000);

  const [shared, setShared] = useState<'idle' | 'shared' | 'copied'>('idle');

  async function handleShare() {
    // No cinema slug on a Plan, so unlike the venue panel this cannot deep
    // link — it shares the decision in words and the app's own front door.
    const outcome = await shareScreening({
      title: plan.movieTitle,
      text: `${plan.movieTitle} at ${plan.cinemaName} — ${formatShowtime(plan.startTime)}, ${formatDayLabel(plan.startTime)}. Planned it on W2W.`,
      url: `${window.location.origin}${window.location.pathname}`,
    });
    if (outcome === 'shared' || outcome === 'copied') {
      setShared(outcome);
      setTimeout(() => setShared('idle'), 1800);
    }
  }

  /**
   * The primary path: no file, no Downloads folder, no importing anything —
   * one tap and the event is sitting in the calendar app ready to save.
   *
   * On Apple platforms that means navigating (never downloading) an .ics
   * blob, which is what makes iOS/macOS hand off straight to Calendar's own
   * add-event screen. Everywhere else it's the Google Calendar compose link,
   * which does the same thing without a file ever existing. Both branches are
   * synchronous, so there is no popup-blocking concern the way there is for
   * the ticket viewer's async IndexedDB read.
   */
  function addToCalendar() {
    if (prefersNativeCalendarHandoff()) {
      const blob = new Blob([planToIcs(plan, leave?.leaveAt ?? null)], {
        type: 'text/calendar;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      window.open(googleCalendarUrl(plan, leave?.leaveAt ?? null), '_blank', 'noopener,noreferrer');
    }
  }

  // --- Ticket attachment ----------------------------------------------------
  // The file itself never touches this component's state beyond the moment it
  // is handed to IndexedDB — only the small metadata stub round-trips through
  // the store. See lib/tickets.ts for why, and where the bytes actually live.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticketBusy, setTicketBusy] = useState<'attach' | 'view' | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be re-picked after a remove
    if (!file) return;

    setTicketBusy('attach');
    setTicketError(null);
    try {
      const meta = await saveTicket(plan.id, file);
      setPlanTicket(plan.id, meta);
    } catch (err) {
      setTicketError(err instanceof TicketStorageError ? err.message : 'Could not save that file.');
      setTimeout(() => setTicketError(null), 5000);
    } finally {
      setTicketBusy(null);
    }
  }

  async function handleViewTicket() {
    // Opened synchronously, before the IndexedDB read — window.open() called
    // after an await falls outside the click's "user activation" window and
    // several browsers (Safari in particular) silently block it as a popup.
    // Opening a blank tab now and navigating it once the blob is ready keeps
    // the whole thing inside one user gesture.
    const popup = window.open('', '_blank');
    setTicketBusy('view');
    try {
      const record = await getTicket(plan.id);
      if (!record || !popup) {
        popup?.close();
        return;
      }
      const url = URL.createObjectURL(record.blob);
      popup.location.href = url;
      // Long enough for the new tab to actually load the blob before it revokes.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      popup?.close();
      setTicketError('Could not open that ticket.');
      setTimeout(() => setTicketError(null), 5000);
    } finally {
      setTicketBusy(null);
    }
  }

  function handleRemoveTicket() {
    deleteTicket(plan.id);
    setPlanTicket(plan.id, undefined);
  }

  return (
    <li className="rounded-3xl border border-hairline bg-card p-3.5">
      <div className="flex items-start gap-3">
        {plan.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.posterUrl}
            alt=""
            loading="lazy"
            className="h-[76px] w-[52px] shrink-0 rounded-xl border border-hairline object-cover"
          />
        ) : (
          <span className="h-[76px] w-[52px] shrink-0 rounded-xl border border-hairline bg-surface" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-title truncate text-[15px] font-bold text-ink">{plan.movieTitle}</h3>
          <p className="mt-0.5 truncate text-[12px] text-muted">{plan.cinemaName}</p>
          <p className="font-numeric mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
            <span className="text-ink">{formatShowtime(plan.startTime)}</span>
            <span aria-hidden>·</span>
            <span>{formatDayLabel(plan.startTime)}</span>
            {plan.screenName && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{plan.screenName}</span>
              </>
            )}
            {formatPrice(plan.ticketPrice) && (
              <>
                <span aria-hidden>·</span>
                <span>{formatPrice(plan.ticketPrice)}</span>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => removePlan(plan.id)}
          aria-label={`Remove ${plan.movieTitle} from plans`}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-errorc active:scale-90"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* The countdown is the reason this screen exists. */}
      <div
        className={cn(
          'font-numeric mt-2.5 rounded-2xl border px-3 py-2 text-[12px]',
          leave && !leave.missed
            ? 'border-brand/30 bg-brandsoft/40 text-ink'
            : 'border-hairline bg-surface/60 text-muted',
        )}
      >
        {leave && !leave.missed ? (
          <>
            <span className="font-semibold">Leave by {formatLeaveAt(leave)}</span>
            <span className="text-muted">
              {' '}
              — {leave.minutesUntil > 0
                ? `in ${formatMinutes(leave.minutesUntil)}`
                : 'now'}{' '}
              · {formatMinutes(leave.estimate.minutes)} drive · {leave.estimate.label}
              <br />
              {describeAllowance(leave)}
            </span>
          </>
        ) : leave?.missed ? (
          <span>Too late for this one — it starts in {formatMinutes(Math.max(0, startsIn))}</span>
        ) : estimate ? (
          <span>
            {formatMinutes(estimate.minutes)} away · {estimate.label}
          </span>
        ) : (
          <span>
            Starts in {formatMinutes(Math.max(0, startsIn))}
            {!userCoords && ' · allow location for a departure time'}
          </span>
        )}
      </div>

      {/* Once attached, the ticket is its own row — glanceable without a tap,
          same idea as the poster thumbnail above. */}
      {plan.ticket && (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted">
            {plan.ticket.type.startsWith('image/') ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-ink">{plan.ticket.filename}</p>
            <p className="font-numeric text-[10.5px] text-muted">{formatBytes(plan.ticket.size)}</p>
          </div>
          <button
            type="button"
            onClick={handleViewTicket}
            disabled={ticketBusy === 'view'}
            className="font-label shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand transition hover:opacity-80 disabled:opacity-50"
          >
            {ticketBusy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'View'}
          </button>
          <button
            type="button"
            onClick={handleRemoveTicket}
            aria-label="Remove ticket"
            className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-card hover:text-errorc active:scale-90"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {ticketError && (
        <p className="mt-2 text-[11px] text-errorc" role="alert">
          {ticketError}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/* Two segments sharing one pill, same convention as a showtime chip:
            the main tap is the smart platform default; the narrow second one
            is the explicit escape hatch for whoever's default guess is wrong
            — an iPhone that actually runs Google Calendar, say. */}
        <span className="font-label inline-flex min-h-[34px] items-stretch overflow-hidden rounded-xl border border-hairline bg-surface text-[12px] text-ink">
          <button
            type="button"
            onClick={addToCalendar}
            className="inline-flex items-center gap-1.5 px-2.5 transition hover:bg-brandsoft hover:text-brandsoftfg active:scale-95"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add to calendar
          </button>
          <button
            type="button"
            onClick={() => window.open(googleCalendarUrl(plan, leave?.leaveAt ?? null), '_blank', 'noopener,noreferrer')}
            aria-label="Add to Google Calendar instead"
            title="Add to Google Calendar instead"
            className="inline-flex items-center border-l border-hairline px-2 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </span>

        <a
          href={directionsUrl(plan)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-[12px] text-ink transition hover:border-brand/40 active:scale-95"
        >
          <Navigation className="h-3.5 w-3.5" />
          Directions
        </a>

        <button
          type="button"
          onClick={handleShare}
          className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-[12px] text-ink transition hover:border-brand/40 active:scale-95"
        >
          {shared === 'copied' ? (
            <Check className="h-3.5 w-3.5 text-brand" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          {shared === 'copied' ? 'Copied' : shared === 'shared' ? 'Shared' : 'Share'}
        </button>

        {/* Once a ticket is attached the row above already covers view/remove —
            offering "attach" again here would just be a second, redundant path. */}
        {!plan.ticket && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={ticketBusy === 'attach'}
            className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-[12px] text-ink transition hover:border-brand/40 active:scale-95 disabled:opacity-60"
          >
            {ticketBusy === 'attach' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            Attach ticket
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={handleFileChosen}
          className="hidden"
        />

        {plan.bookingUrl && (
          <a
            href={plan.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-brand bg-brand px-2.5 text-[12px] font-semibold text-onbrand transition active:scale-95"
          >
            <Ticket className="h-3.5 w-3.5" />
            Tickets
          </a>
        )}
      </div>
    </li>
  );
}
