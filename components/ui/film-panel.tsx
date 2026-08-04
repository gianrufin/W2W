'use client';

import { useMemo } from 'react';
import { X, Sparkles, MapPin } from 'lucide-react';
import { FormatBadge } from './format-badge';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import {
  cn,
  chainLabel,
  driveMinutes,
  formatDayLabel,
  formatDistance,
  formatDuration,
  formatMinutes,
  formatPrice,
  formatShowtime,
  hasStarted,
} from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes, type Showtime } from '@/types';

/**
 * One film, everywhere it is playing.
 *
 * The rest of the app is venue-first: here are the cinemas, here is what is on
 * at each. But people frequently decide the other way round — "I want to watch
 * this, where and when can I?" — and answering that by reading twelve venue
 * cards is work the app should be doing.
 *
 * Selecting a film already narrows the map to venues screening it. This is the
 * list that goes with that map: every showing, grouped by venue, ordered by how
 * soon you could be sitting in it.
 */
export function FilmPanel({ cinemas }: { cinemas: CinemaWithShowtimes[] }) {
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const setSelectedMovie = useDiscoveryStore((s) => s.setSelectedMovie);
  const openCinema = useDiscoveryStore((s) => s.openCinema);

  const venues = useMemo(() => {
    if (!selectedMovie) return [];

    return cinemas
      .map((cinema) => ({
        cinema,
        slots: cinema.showtimes
          .filter((s) => s.movie_id === selectedMovie.id)
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }))
      .filter((v) => v.slots.length > 0)
      // Soonest first: the question "when can I see this" is answered by time,
      // not by which cinema happens to be nearest the map's centre.
      .sort((a, b) => nextStart(a.slots) - nextStart(b.slots));
  }, [cinemas, selectedMovie]);

  if (!selectedMovie) return null;

  const totalShowings = venues.reduce((n, v) => n + v.slots.length, 0);
  const cheapest = venues
    .flatMap((v) => v.slots.map((s) => s.ticket_price))
    .filter((p): p is number => typeof p === 'number' && p > 0);

  return (
    <>
      <header className="flex shrink-0 items-start gap-3 px-4 pb-3">
        {selectedMovie.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selectedMovie.poster_url}
            alt=""
            className="h-[86px] w-[58px] shrink-0 rounded-2xl border border-hairline object-cover shadow-soft"
          />
        ) : (
          <span className="h-[86px] w-[58px] shrink-0 rounded-2xl border border-hairline bg-surface" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="font-title text-[18px] font-bold leading-tight text-ink">
            {selectedMovie.title}
          </h2>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            {selectedMovie.rating && <span>{selectedMovie.rating}</span>}
            {formatDuration(selectedMovie.duration_mins) && (
              <span className="font-numeric">{formatDuration(selectedMovie.duration_mins)}</span>
            )}
            {selectedMovie.festival_name && (
              <span className="inline-flex items-center gap-1 text-tertiary">
                <Sparkles className="h-3 w-3" />
                {selectedMovie.festival_name}
              </span>
            )}
          </p>

          <p className="font-numeric mt-1.5 text-[12px] text-muted">
            <span className="text-ink">{totalShowings}</span>{' '}
            {totalShowings === 1 ? 'showing' : 'showings'} at{' '}
            <span className="text-ink">{venues.length}</span>{' '}
            {venues.length === 1 ? 'cinema' : 'cinemas'}
            {cheapest.length > 0 && <> · from {formatPrice(Math.min(...cheapest))}</>}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedMovie(null)}
          aria-label="Clear film filter"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {venues.length === 0 ? (
          <p className="px-2 py-10 text-center text-[13px] text-muted">
            Not screening anywhere in this area.
            <br />
            Pan the map and search a wider one.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {venues.map(({ cinema, slots }) => (
              <li key={cinema.id} className="rounded-3xl border border-hairline bg-card p-3.5">
                <button
                  type="button"
                  onClick={() => openCinema(cinema.id)}
                  className="block w-full text-left"
                >
                  <span
                    className={cn(
                      'font-label block truncate text-[10px] font-semibold uppercase tracking-widest',
                      isIndieChain(cinema.chain) ? 'text-tertiary' : 'text-brand',
                    )}
                  >
                    {chainLabel(cinema.chain)}
                  </span>
                  <span className="font-title mt-0.5 block truncate text-[15px] font-bold text-ink">
                    {cinema.name}
                  </span>
                  <span className="font-numeric mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                    <MapPin className="h-3 w-3" />
                    <span>{formatDistance(cinema.distance_km).replace(' away', '')}</span>
                    <span aria-hidden>·</span>
                    <span>{formatMinutes(driveMinutes(cinema.distance_km))} drive</span>
                  </span>
                </button>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {slots.map((slot) => (
                    <FilmSlot key={slot.id} slot={slot} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function FilmSlot({ slot }: { slot: Showtime }) {
  const started = hasStarted(slot.start_time);
  const price = formatPrice(slot.ticket_price);

  return (
    <a
      href={slot.booking_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      title={[slot.screen_name, price].filter(Boolean).join(' · ') || undefined}
      className={cn(
        'font-numeric inline-flex min-h-[34px] flex-col items-start justify-center gap-0 rounded-xl border px-2.5 py-1 text-[12px] transition active:scale-95',
        started
          ? 'border-hairline bg-surface/50 text-muted line-through opacity-60'
          : 'border-hairline bg-surface text-ink hover:border-brand/40',
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {formatShowtime(slot.start_time)}
        <FormatBadge format={slot.format} size="xs" />
      </span>
      {/* Price only where a chain publishes one; most do not. */}
      {price && <span className="text-[10px] text-muted">{price}</span>}
    </a>
  );
}

/** Timestamp of the soonest screening still to come, for ordering venues. */
function nextStart(slots: Showtime[]): number {
  const upcoming = slots
    .filter((s) => !hasStarted(s.start_time))
    .map((s) => Date.parse(s.start_time));
  return upcoming.length ? Math.min(...upcoming) : Number.POSITIVE_INFINITY;
}

/** Re-exported for the dock header, which shows the day being browsed. */
export function filmPanelDayLabel(date: string): string {
  return formatDayLabel(`${date}T12:00:00+08:00`);
}
