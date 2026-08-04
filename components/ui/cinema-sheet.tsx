'use client';

import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, MapPin, Navigation, Ticket, Clock, Sparkles } from 'lucide-react';
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
  // Most screenings first — that is usually the film the venue is pushing.
  return [...groups.values()].sort((a, b) => b.slots.length - a.slots.length);
}

/**
 * Cinema detail.
 *
 * A bottom sheet on phones and a centred dialog from `sm` up — one component,
 * because the content is identical and only the framing differs. The film list
 * scrolls inside the sheet, so a venue with thirty films is as usable as one
 * with two, and the map stays visible behind it.
 */
export function CinemaSheet() {
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const openCinemaId = useDiscoveryStore((s) => s.openCinemaId);
  const openCinema = useDiscoveryStore((s) => s.openCinema);

  const cinema = useMemo(
    () => cinemas.find((c) => c.id === openCinemaId) ?? null,
    [cinemas, openCinemaId],
  );

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!cinema) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') openCinema(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cinema, openCinema]);

  return (
    <AnimatePresence>
      {cinema && <SheetBody key={cinema.id} cinema={cinema} onClose={() => openCinema(null)} />}
    </AnimatePresence>
  );
}

function SheetBody({ cinema, onClose }: { cinema: CinemaWithShowtimes; onClose: () => void }) {
  const groups = useMemo(() => groupByMovie(cinema.showtimes), [cinema.showtimes]);
  const indie = isIndieChain(cinema.chain);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={cinema.name}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.6 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-4xl border border-hairline bg-card shadow-float',
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[80dvh] sm:w-[440px]',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-4xl',
        )}
      >
        {/* Grab handle — signals the sheet is dismissable on touch. */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-hairline" />
        </div>

        <header className="flex items-start gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'font-label text-[10px] uppercase tracking-widest',
                indie ? 'text-tertiary' : 'text-brand',
              )}
            >
              {chainLabel(cinema.chain)}
            </p>
            <h2 className="font-title mt-1 text-[19px] leading-tight text-ink">{cinema.name}</h2>

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
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

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

        {/* The stack scrolls; the header and footer stay put. */}
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
                  <h3 className="font-title text-[15px] leading-snug text-ink">{group.title}</h3>

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
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.slots.map((slot) => (
                      <ShowtimeChip key={slot.id} slot={slot} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-hairline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <a
            href={groups[0]?.slots[0]?.booking_url ?? cinema.website_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-3.5 text-[14px] text-onbrand shadow-soft transition hover:brightness-110 active:scale-[0.98]"
          >
            <Ticket className="h-4 w-4" />
            Book tickets
          </a>
        </footer>
      </motion.div>
    </>
  );
}

function ShowtimeChip({ slot }: { slot: Showtime }) {
  const started = hasStarted(slot.start_time);
  const soon = isStartingSoon(slot.start_time);
  const price = formatPrice(slot.ticket_price);

  return (
    <a
      href={slot.booking_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      title={[slot.screen_name, price].filter(Boolean).join(' · ') || undefined}
      className={cn(
        // 44px tall on touch: these are the app's primary tap targets.
        'font-numeric inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl border px-2.5 text-[12px] transition',
        started
          ? 'border-hairline bg-surface/60 text-muted line-through opacity-60'
          : 'border-hairline bg-surface text-ink active:scale-95 hover:border-brand hover:bg-brandsoft hover:text-brandsoftfg',
      )}
    >
      {soon && <Clock className="h-3 w-3 text-brand" />}
      {formatShowtime(slot.start_time)}
      <FormatBadge format={slot.format} size="xs" />
    </a>
  );
}
