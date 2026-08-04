'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Navigation, Ticket, Trash2, Clock } from 'lucide-react';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { useTravelEstimate } from '@/hooks/use-travel';
import { formatLeaveAt, planLeaveBy } from '@/lib/travel';
import { directionsUrl, planToIcs, type Plan } from '@/lib/plans';
import { cn, formatDayLabel, formatMinutes, formatShowtime, formatPrice } from '@/lib/utils';

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
          lands here — with the time to leave, directions, and your ticket link.
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

  function addToCalendar() {
    const blob = new Blob([planToIcs(plan, leave?.leaveAt ?? null)], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${plan.movieTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    link.click();
    // Revoking immediately can cancel the download on some mobile browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-brand active:scale-90"
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

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={addToCalendar}
          className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-[12px] text-ink transition hover:border-brand/40 active:scale-95"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Add to calendar
        </button>

        <a
          href={directionsUrl(plan)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-label inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-[12px] text-ink transition hover:border-brand/40 active:scale-95"
        >
          <Navigation className="h-3.5 w-3.5" />
          Directions
        </a>

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
