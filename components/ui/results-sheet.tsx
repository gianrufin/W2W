'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Heart, Crosshair, ArrowLeft } from 'lucide-react';
import { CinemaRow } from './cinema-row';
import { VenuePanel } from './venue-panel';
import { cn, formatDayLabel, manilaDateKey, matchesQuickFilter } from '@/lib/utils';
import { useDiscoveryStore, type QuickFilter } from '@/store/use-discovery-store';

const QUICK_FILTERS: QuickFilter[] = ['Tonight', 'Soon', 'Premium', 'Indie'];

/**
 * The dock — the app's only surface over the map.
 *
 * Three heights rather than a free drag: a snap point you can hit with a thumb
 * beats a gesture you have to aim.
 *
 *   peek   a single bar. The map is clear, which is the point — you cannot
 *          navigate a map that something else is sitting on top of.
 *   list   the results, about half the screen.
 *   venue  one cinema's full schedule.
 *
 * `venue` used to be a separate modal floating above this sheet. Folding it in
 * means one thing to dismiss instead of two, and the map keeps the same amount
 * of room whichever you are looking at.
 */
export function ResultsSheet({
  onLocateMe,
  locating,
}: {
  onLocateMe: () => void;
  locating: boolean;
}) {
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const loading = useDiscoveryStore((s) => s.loading);
  const error = useDiscoveryStore((s) => s.error);
  const areaLabel = useDiscoveryStore((s) => s.areaLabel);
  const date = useDiscoveryStore((s) => s.date);
  const quick = useDiscoveryStore((s) => s.quick);
  const setQuick = useDiscoveryStore((s) => s.setQuick);
  const dock = useDiscoveryStore((s) => s.dock);
  const setDock = useDiscoveryStore((s) => s.setDock);
  const openCinema = useDiscoveryStore((s) => s.openCinema);
  const openCinemaId = useDiscoveryStore((s) => s.openCinemaId);
  const tab = useDiscoveryStore((s) => s.tab);
  const saved = useDiscoveryStore((s) => s.saved);

  const visible = useMemo(() => {
    // "Soon" is a narrowing of what is loaded, not a different query — see the
    // note on `quick` in the store.
    let rows = cinemas.filter((c) => matchesQuickFilter(c, quick));
    if (tab === 'saved') rows = rows.filter((c) => saved.includes(c.id));
    return rows;
  }, [cinemas, quick, tab, saved]);

  const openVenue = useMemo(
    () => visible.find((c) => c.id === openCinemaId) ?? null,
    [visible, openCinemaId],
  );

  // Escape steps back one level rather than closing everything, matching what
  // the back chevron does.
  useEffect(() => {
    if (dock === 'peek') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dock === 'venue') openCinema(null);
      else setDock('peek');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dock, openCinema, setDock]);

  const showtimeCount = visible.reduce((n, c) => n + c.showtimes.length, 0);

  return (
    <motion.section
      layout
      aria-label="Results"
      className={cn(
        'pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-4xl border-t border-hairline bg-card shadow-float',
        dock === 'peek' && 'max-h-[84px]',
        dock === 'list' && 'max-h-[46dvh]',
        // Expanded stops below the search field rather than under it — searching
        // is how you get out of a list with the wrong thing in it.
        dock === 'venue' && 'top-[calc(env(safe-area-inset-top)+116px)]',
      )}
    >
      {/*
        Anchored to the dock's own edge rather than the viewport, so it rides up
        and down with the dock instead of being buried by it.
      */}
      {dock !== 'venue' && (
        <button
          type="button"
          onClick={onLocateMe}
          aria-label="Find cinemas near me"
          className="glass-panel absolute -top-14 right-3 flex h-11 w-11 items-center justify-center rounded-full text-ink shadow-float active:scale-95"
        >
          <Crosshair className={cn('h-5 w-5', locating && 'animate-pulse')} />
        </button>
      )}

      {dock === 'venue' && openVenue ? (
        <>
          <header className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-3">
            <button
              type="button"
              onClick={() => openCinema(null)}
              aria-label="Back to results"
              className="shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="font-numeric text-[12px] text-muted">
              {visible.length} {visible.length === 1 ? 'cinema' : 'cinemas'} nearby
            </span>
          </header>
          <VenuePanel cinema={openVenue} />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setDock(dock === 'peek' ? 'list' : 'peek')}
            aria-expanded={dock === 'list'}
            className="flex w-full shrink-0 flex-col items-stretch rounded-t-4xl px-4 pb-1 pt-2.5 text-left"
          >
            <span className="mx-auto mb-2 h-1 w-10 rounded-full bg-hairline" aria-hidden />

            <span className="flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="font-title block truncate text-[16px] font-bold text-ink">
                  {headline(tab, date, areaLabel)}
                </span>
                <span className="font-numeric mt-0.5 block text-[12px] text-muted">
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Searching…
                    </span>
                  ) : error ? (
                    <span className="text-brand">Schedule data unavailable</span>
                  ) : (
                    <>
                      {visible.length} {visible.length === 1 ? 'cinema' : 'cinemas'} ·{' '}
                      {showtimeCount} showtimes
                    </>
                  )}
                </span>
              </span>

              <span className="font-label inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline px-3 py-1.5 text-[12px] text-ink">
                {dock === 'list' ? (
                  <>
                    Map <ChevronDown className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    View list <ChevronUp className="h-3.5 w-3.5" />
                  </>
                )}
              </span>
            </span>
          </button>

          {/* Everything below the bar is hidden at peek height, not unmounted —
              re-rendering the whole list on every expand costs a visible frame. */}
          <div className={cn('flex min-h-0 flex-1 flex-col', dock === 'peek' && 'invisible')}>
            {/*
              `shrink-0` is load-bearing. Without it flex squeezes this row
              under a capped-height dock, and the first result card rides up
              over the chips instead of scrolling beneath them.
            */}
            <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 py-2.5">
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQuick(f)}
                  aria-pressed={quick === f}
                  className={cn(
                    'font-label inline-flex min-h-[32px] shrink-0 items-center rounded-full border px-3.5 text-[12px] transition active:scale-95',
                    quick === f
                      ? 'border-brand/50 bg-brandsoft text-brandsoftfg'
                      : 'border-hairline bg-surface text-muted hover:text-ink',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {visible.length === 0 && !loading ? (
                <EmptyState tab={tab} quick={quick} areaLabel={areaLabel} error={error} />
              ) : (
                <ul className="space-y-2.5">
                  {visible.map((cinema) => (
                    <CinemaRow
                      key={cinema.id}
                      cinema={cinema}
                      onOpen={() => openCinema(cinema.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}

function EmptyState({
  tab,
  quick,
  areaLabel,
  error,
}: {
  tab: string;
  quick: QuickFilter;
  areaLabel: string | null;
  error: string | null;
}) {
  // A configuration or query failure is a different problem from "nothing is
  // screening", and must never look the same.
  if (error) {
    return (
      <p className="px-2 py-10 text-center text-[13px] text-muted">
        The schedule could not be loaded. This is a problem on our side, not an
        empty night.
      </p>
    );
  }

  if (tab === 'saved') {
    return (
      <p className="flex flex-col items-center gap-2 px-2 py-10 text-center text-[13px] text-muted">
        <Heart className="h-5 w-5" />
        Nothing saved in this area yet. Tap the heart on a cinema to keep it here.
      </p>
    );
  }

  return (
    <p className="px-2 py-10 text-center text-[13px] text-muted">
      {quick === 'Soon'
        ? 'Nothing starting in the next 90 minutes here.'
        : `No screenings ${areaLabel ? `in ${areaLabel}` : 'in this area'}.`}
      <br />
      Pan the map and search a wider area.
    </p>
  );
}

function headline(tab: string, date: string, areaLabel: string | null): string {
  if (tab === 'saved') return 'Saved cinemas';
  if (tab === 'plans') return 'My plans';

  const today = date === manilaDateKey();
  const where = areaLabel ? `in ${areaLabel}` : 'near you';
  return today ? `Tonight ${where}` : `${formatDayLabel(`${date}T12:00:00+08:00`)} ${where}`;
}
