'use client';

import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Ticket, Clock, Sparkles } from 'lucide-react';
import { FormatBadge } from './format-badge';
import {
  cn,
  chainLabel,
  formatDistance,
  formatDuration,
  formatPrice,
  formatShowtime,
  hasStarted,
  isStartingSoon,
} from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes, type Showtime } from '@/types';

interface CinemaCardProps {
  cinema: CinemaWithShowtimes;
  selected: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
  /** When a film is selected we already know the title — collapse the grouping. */
  singleMovie?: boolean;
}

/** Group a venue's screenings by film so one card reads as one venue. */
function groupByMovie(showtimes: Showtime[]) {
  const groups = new Map<
    string,
    { title: string; poster: string | null; meta: Showtime; slots: Showtime[] }
  >();
  for (const s of showtimes) {
    const existing = groups.get(s.movie_id);
    if (existing) existing.slots.push(s);
    else
      groups.set(s.movie_id, {
        title: s.movie_title,
        poster: s.poster_url ?? null,
        meta: s,
        slots: [s],
      });
  }
  return [...groups.values()];
}

export const CinemaCard = forwardRef<HTMLDivElement, CinemaCardProps>(function CinemaCard(
  { cinema, selected, onSelect, onHover, singleMovie = false },
  ref,
) {
  const groups = useMemo(() => groupByMovie(cinema.showtimes), [cinema.showtimes]);
  const indie = isIndieChain(cinema.chain);
  const accent = indie ? 'text-tertiary' : 'text-brand';

  return (
    <motion.div
      ref={ref}
      layout
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={cn(
        'group relative w-[330px] max-w-[86vw] shrink-0 cursor-pointer rounded-4xl border bg-card p-5 shadow-card transition-colors',
        // Long schedules scroll inside the card instead of stretching the sheet.
        'no-scrollbar max-h-[50dvh] overflow-y-auto',
        'lg:max-h-none lg:overflow-hidden',
        selected
          ? indie
            ? 'border-tertiary ring-1 ring-tertiary/40'
            : 'border-brand ring-1 ring-brand/40'
          : 'border-hairline',
      )}
    >
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn('text-[10px] font-semibold uppercase tracking-widest', accent)}>
              {chainLabel(cinema.chain)}
            </p>
            <h3 className="font-serif mt-1 truncate text-[15px] leading-tight text-ink">
              {cinema.name}
            </h3>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-xl border border-hairline bg-surface px-2 py-1 text-[10px] font-medium text-muted">
            <Navigation className="h-3 w-3" />
            {formatDistance(cinema.distance_km)}
          </span>
        </div>

        {cinema.address && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-muted">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{cinema.address}</span>
          </p>
        )}

        <div className="mt-4 space-y-4">
          {groups.slice(0, singleMovie ? 1 : 3).map((group) => (
            <div key={group.meta.movie_id} className="flex gap-3">
              {group.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.poster}
                  alt=""
                  className="h-[86px] w-[58px] shrink-0 rounded-2xl border border-hairline object-cover shadow-soft"
                />
              )}

              <div className="min-w-0 flex-1">
                {/* The one place Instrument Serif is used. */}
                <p className="font-title truncate text-[17px] leading-snug text-ink">
                  {group.title}
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                  {group.meta.rating && <span>{group.meta.rating}</span>}
                  {formatDuration(group.meta.duration_mins) && (
                    <span>{formatDuration(group.meta.duration_mins)}</span>
                  )}
                  {group.meta.festival_name && (
                    <span className="inline-flex items-center gap-1 text-tertiary">
                      <Sparkles className="h-3 w-3" />
                      {group.meta.festival_name}
                    </span>
                  )}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.slots.slice(0, 5).map((slot) => (
                    <ShowtimeChip key={slot.id} slot={slot} />
                  ))}
                  {group.slots.length > 5 && (
                    <span className="self-center text-[10px] text-muted">
                      +{group.slots.length - 5}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!singleMovie && groups.length > 3 && (
            <p className="text-[11px] text-muted">
              +{groups.length - 3} more {groups.length - 3 === 1 ? 'film' : 'films'} screening here
            </p>
          )}
        </div>

        <a
          href={groups[0]?.slots[0]?.booking_url ?? cinema.website_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-3xl bg-brand px-4 py-3 text-[13px] font-medium text-onbrand shadow-soft transition hover:brightness-110 active:scale-[0.98]"
        >
          <Ticket className="h-4 w-4" />
          Book Ticket
        </a>
      </div>
    </motion.div>
  );
});

function ShowtimeChip({ slot }: { slot: Showtime }) {
  const started = hasStarted(slot.start_time);
  const soon = isStartingSoon(slot.start_time);
  const price = formatPrice(slot.ticket_price);

  return (
    <a
      href={slot.booking_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={[slot.screen_name, price].filter(Boolean).join(' · ') || undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-2xl border px-2 py-1 text-[11px] transition',
        started
          ? 'border-hairline bg-surface/60 text-muted line-through opacity-60'
          : 'border-hairline bg-surface text-ink hover:border-brand hover:bg-brandsoft hover:text-brandsoftfg',
      )}
    >
      {soon && <Clock className="h-3 w-3 text-brand" />}
      {formatShowtime(slot.start_time)}
      <FormatBadge format={slot.format} size="xs" />
    </a>
  );
}
