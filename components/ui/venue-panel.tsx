'use client';

import { useMemo, useState } from 'react';
import {
  MapPin,
  Navigation,
  Ticket,
  Sparkles,
  Car,
  Heart,
  CalendarPlus,
  Check,
  Share2,
} from 'lucide-react';
import { FormatBadge } from './format-badge';
import { EndingSoonBadge } from './ending-soon-badge';
import { useTravelEstimate } from '@/hooks/use-travel';
import { describeAllowance, formatLeaveAt, planLeaveBy } from '@/lib/travel';
import { planId } from '@/lib/plans';
import { shareScreening } from '@/lib/share';
import {
  cn,
  chainLabel,
  formatDistance,
  formatMinutes,
  formatDuration,
  formatPrice,
  formatShowtime,
  hasStarted,
} from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes, type Showtime } from '@/types';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/** One entry per film, with its screenings ordered by time. */
function groupByMovie(showtimes: Showtime[]) {
  const groups = new Map<
    string,
    { id: string; title: string; poster: string | null; meta: Showtime; slots: Showtime[] }
  >();
  for (const s of showtimes) {
    const existing = groups.get(s.movie_id);
    if (existing) existing.slots.push(s);
    else
      groups.set(s.movie_id, {
        id: s.movie_id,
        title: s.movie_title,
        poster: s.poster_url ?? null,
        meta: s,
        slots: [s],
      });
  }
  for (const g of groups.values()) g.slots.sort((a, b) => a.start_time.localeCompare(b.start_time));
  // Most screenings first — usually the film the venue is pushing.
  return [...groups.values()].sort((a, b) => b.slots.length - a.slots.length);
}

/**
 * One cinema's schedule, filling the dock.
 *
 * This was a modal floating above the results sheet. It is now the dock's third
 * state, so there is one surface over the map instead of two stacked ones.
 */
export function VenuePanel({ cinema }: { cinema: CinemaWithShowtimes }) {
  const groups = useMemo(() => groupByMovie(cinema.showtimes), [cinema.showtimes]);
  const indie = isIndieChain(cinema.chain);

  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const saved = useDiscoveryStore((s) => s.saved.includes(cinema.id));
  const toggleSaved = useDiscoveryStore((s) => s.toggleSaved);
  const festivalsEndingSoon = useDiscoveryStore((s) => s.festivalsEndingSoon);

  const next = cinema.showtimes.find((s) => !hasStarted(s.start_time)) ?? null;

  const [shared, setShared] = useState<'idle' | 'shared' | 'copied'>('idle');

  async function handleShare() {
    const outcome = await shareScreening({
      title: cinema.name,
      text: next
        ? `${next.movie_title} at ${cinema.name} — ${formatShowtime(next.start_time)}. Found it on W2W.`
        : `${cinema.name}, on W2W.`,
      // The one deep link the export supports — see discovery-shell's
      // `?cinema=` handling, which opens straight to this panel.
      url: `${window.location.origin}${window.location.pathname}?cinema=${cinema.slug}`,
    });
    if (outcome === 'shared' || outcome === 'copied') {
      setShared(outcome);
      setTimeout(() => setShared('idle'), 1800);
    }
  }

  return (
    <>
      <header className="flex items-start gap-3 px-5 pb-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-label text-[10px] uppercase tracking-widest',
              indie ? 'text-tertiary' : 'text-brand',
            )}
          >
            {chainLabel(cinema.chain)}
          </p>
          <h2 className="font-title mt-1 text-[19px] font-bold leading-tight text-ink">
            {cinema.name}
          </h2>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="font-numeric inline-flex items-center gap-1">
              <Navigation className="h-3 w-3" />
              {formatDistance(cinema.distance_km)}
            </span>
            {cinema.address && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{cinema.address}</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          aria-label={shared === 'copied' ? 'Link copied' : `Share ${cinema.name}`}
          title={shared === 'copied' ? 'Link copied' : undefined}
          className="-mr-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface active:scale-90"
        >
          {shared === 'copied' ? (
            <Check className="h-4 w-4 text-brand" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => toggleSaved(cinema.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${cinema.name} from saved` : `Save ${cinema.name}`}
          className="-ml-1 -mr-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface active:scale-90"
        >
          <Heart className={cn('h-4 w-4', saved && 'fill-brand text-brand')} />
        </button>
      </header>

      {next && <LeaveByBar cinema={cinema} next={next} userCoords={userCoords} />}

      <div className="flex items-center justify-between border-y border-hairline bg-surface/60 px-5 py-2">
        <span className="font-numeric text-[11px] text-muted">
          <span className="text-ink">{groups.length}</span>{' '}
          {groups.length === 1 ? 'film' : 'films'} ·{' '}
          <span className="text-ink">{cinema.showtimes.length}</span> showtimes
        </span>
        {cinema.website_url && (
          <a
            href={cinema.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label text-[11px] text-brand hover:opacity-80"
          >
            Cinema site
          </a>
        )}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <ul className="space-y-5">
          {groups.map((group) => (
            <li key={group.id} className="flex gap-3">
              {group.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.poster}
                  alt=""
                  loading="lazy"
                  className="h-[92px] w-[62px] shrink-0 rounded-2xl border border-hairline object-cover shadow-soft"
                />
              ) : (
                <span className="h-[92px] w-[62px] shrink-0 rounded-2xl border border-hairline bg-surface" />
              )}

              <div className="min-w-0 flex-1">
                <h3 className="font-title text-[15px] font-bold leading-snug text-ink">
                  {group.title}
                </h3>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                  {group.meta.rating && <span>{group.meta.rating}</span>}
                  {formatDuration(group.meta.duration_mins) && (
                    <span className="font-numeric">{formatDuration(group.meta.duration_mins)}</span>
                  )}
                  {group.meta.festival_name && (
                    <span className="inline-flex items-center gap-1 text-tertiary">
                      <Sparkles className="h-3 w-3" />
                      {group.meta.festival_name}
                    </span>
                  )}
                  {group.meta.festival_name &&
                    festivalsEndingSoon.includes(group.meta.festival_name) && (
                      <EndingSoonBadge />
                    )}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.slots.map((slot) => (
                    <ShowtimeChip
                      key={slot.id}
                      slot={slot}
                      cinema={cinema}
                      poster={group.poster}
                    />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <footer className="border-t border-hairline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <a
          href={next?.booking_url ?? cinema.website_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-gradient font-label flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Ticket className="h-4 w-4" />
          Book tickets
        </a>
      </footer>
    </>
  );
}

/**
 * When to leave, for the next screening.
 *
 * The one thing here that turns a listing into a plan. It always states which
 * kind of estimate produced it — "live traffic" and "typical traffic" deserve
 * different amounts of trust, and hiding the difference would be the dishonest
 * choice.
 *
 * With no location permission there is nothing to measure from, so the bar does
 * not appear at all rather than inventing an origin.
 */
function LeaveByBar({
  cinema,
  next,
  userCoords,
}: {
  cinema: CinemaWithShowtimes;
  next: Showtime;
  userCoords: { lat: number; lng: number } | null;
}) {
  const departAt = useMemo(() => {
    // Estimate traffic for when the journey would actually start, not for now:
    // EDSA at 2pm and EDSA at 6pm are different roads.
    const rough = new Date(new Date(next.start_time).getTime() - 60 * 60_000);
    return rough.getTime() > Date.now() ? rough : new Date();
  }, [next.start_time]);

  const estimate = useTravelEstimate(
    userCoords,
    { lat: cinema.lat, lng: cinema.lng },
    userCoords ? departAt : null,
  );

  if (!userCoords || !estimate) return null;

  const plan = planLeaveBy(next.start_time, estimate);

  return (
    <div
      className={cn(
        'mx-5 mb-3 flex items-center gap-3 rounded-2xl border px-3.5 py-2.5',
        plan?.missed
          ? 'border-hairline bg-surface/60'
          : 'border-brand/30 bg-brandsoft/40',
      )}
    >
      <Car className={cn('h-4 w-4 shrink-0', plan?.missed ? 'text-muted' : 'text-brand')} />

      <div className="min-w-0 flex-1">
        <p className="font-numeric text-[13px] font-semibold text-ink">
          {plan && !plan.missed ? (
            <>Leave by {formatLeaveAt(plan)}</>
          ) : plan?.missed ? (
            <>Too late for the {formatShowtime(next.start_time)}</>
          ) : (
            // No departure time we would stand behind — the drive alone is
            // still useful, and claiming a minute here would not be.
            <>About {formatMinutes(estimate.minutes)} away</>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {formatMinutes(estimate.minutes)} drive · {estimate.label} · for the{' '}
          {formatShowtime(next.start_time)}
        </p>
        {/* Says out loud why the time is earlier than the drive alone. */}
        {plan && !plan.missed && (
          <p className="mt-0.5 text-[11px] text-muted">{describeAllowance(plan)}</p>
        )}
      </div>
    </div>
  );
}

/**
 * One screening: the time links to the box office, the tick saves it as a plan.
 *
 * Two actions in one chip rather than a menu, because both are one-tap
 * decisions and a screening has exactly these two things you can do with it.
 */
function ShowtimeChip({
  slot,
  cinema,
  poster,
}: {
  slot: Showtime;
  cinema: CinemaWithShowtimes;
  poster: string | null;
}) {
  const started = hasStarted(slot.start_time);
  const price = formatPrice(slot.ticket_price);

  const togglePlan = useDiscoveryStore((s) => s.togglePlan);
  const planned = useDiscoveryStore((s) =>
    s.plans.some((p) => p.id === planId(cinema.id, slot.movie_title, slot.start_time)),
  );

  return (
    <span
      className={cn(
        'font-numeric inline-flex min-h-[40px] items-stretch overflow-hidden rounded-2xl border text-[12px] transition',
        started
          ? 'border-hairline bg-surface/60 text-muted opacity-60'
          : 'border-hairline bg-surface text-ink',
      )}
    >
      <a
        href={slot.booking_url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        title={[slot.screen_name, price].filter(Boolean).join(' · ') || undefined}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 transition',
          started ? 'line-through' : 'hover:bg-brandsoft hover:text-brandsoftfg active:scale-95',
        )}
      >
        {formatShowtime(slot.start_time)}
        <FormatBadge format={slot.format} size="xs" />
      </a>

      {!started && (
        <button
          type="button"
          onClick={() =>
            togglePlan({
              cinemaId: cinema.id,
              cinemaName: cinema.name,
              cinemaLat: cinema.lat,
              cinemaLng: cinema.lng,
              cinemaAddress: cinema.address,
              movieTitle: slot.movie_title,
              posterUrl: poster,
              screenName: slot.screen_name,
              format: slot.format,
              startTime: slot.start_time,
              durationMins: slot.duration_mins,
              bookingUrl: slot.booking_url,
              ticketPrice: slot.ticket_price,
            })
          }
          aria-pressed={planned}
          aria-label={
            planned
              ? `Remove the ${formatShowtime(slot.start_time)} showing from your plans`
              : `Plan the ${formatShowtime(slot.start_time)} showing`
          }
          className={cn(
            'inline-flex items-center border-l px-2 transition active:scale-95',
            planned
              ? 'border-brand/40 bg-brand text-onbrand'
              : 'border-hairline text-muted hover:bg-surface hover:text-ink',
          )}
        >
          {planned ? <Check className="h-3.5 w-3.5" /> : <CalendarPlus className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
