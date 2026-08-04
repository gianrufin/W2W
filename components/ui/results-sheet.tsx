'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, MapPinOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { CinemaCard } from './cinema-card';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { cn } from '@/lib/utils';

interface ResultsSheetProps {
  registerCard: (id: string, node: HTMLElement | null) => void;
  onSelectCard: (id: string) => void;
  onHoverCard: (id: string | null) => void;
}

/**
 * Bottom sheet carousel (mobile) / side rail (desktop).
 * Horizontally scrolling on small screens, a vertical column from `lg` up.
 */
export function ResultsSheet({ registerCard, onSelectCard, onHoverCard }: ResultsSheetProps) {
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const loading = useDiscoveryStore((s) => s.loading);
  const selectedCinemaId = useDiscoveryStore((s) => s.selectedCinemaId);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const resetFilters = useDiscoveryStore((s) => s.resetFilters);

  const [collapsed, setCollapsed] = useState(false);

  const totalShowtimes = cinemas.reduce((n, c) => n + c.showtimes.length, 0);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-30',
        'lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[380px] lg:pt-[168px]',
      )}
    >
      <div className="pointer-events-auto lg:h-full">
        {/* Summary bar */}
        <div className="glass-panel mx-3 flex items-center justify-between gap-3 rounded-b-none px-4 py-2.5 lg:mx-4 lg:rounded-4xl">
          <p className="min-w-0 truncate text-[11px] text-muted">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Finding screenings…
              </span>
            ) : (
              <>
                <span className="font-medium text-ink">{cinemas.length}</span>{' '}
                {cinemas.length === 1 ? 'venue' : 'venues'} ·{' '}
                <span className="font-medium text-ink">{totalShowtimes}</span> showtimes
                {selectedMovie && (
                  <>
                    {' '}
                    for <span className="font-title text-[13px] text-brand">{selectedMovie.title}</span>
                  </>
                )}
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand results' : 'Collapse results'}
            className="shrink-0 rounded-xl p-1 text-muted transition hover:bg-surface hover:text-ink lg:hidden"
          >
            <ChevronUp className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="overflow-hidden lg:h-[calc(100%-52px)] lg:overflow-visible"
            >
              {cinemas.length === 0 && !loading ? (
                <EmptyState onReset={resetFilters} />
              ) : (
                <div
                  className={cn(
                    'no-scrollbar flex gap-3 overflow-x-auto px-3 pb-4 pt-3',
                    // The sheet must never grow past the viewport and shove the
                    // header off screen — cap it and let each card scroll inside.
                    'max-h-[52dvh] items-start',
                    'lg:max-h-none lg:h-full lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-4',
                  )}
                >
                  {cinemas.map((cinema) => (
                    <CinemaCard
                      key={cinema.id}
                      ref={(node) => registerCard(cinema.id, node)}
                      cinema={cinema}
                      selected={cinema.id === selectedCinemaId}
                      singleMovie={Boolean(selectedMovie)}
                      onSelect={() => onSelectCard(cinema.id)}
                      onHover={(hovering) => onHoverCard(hovering ? cinema.id : null)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="glass-panel mx-3 rounded-t-none px-5 py-8 text-center lg:mx-4 lg:mt-3 lg:rounded-4xl">
      <MapPinOff className="mx-auto h-6 w-6 text-muted" />
      <p className="font-serif mt-3 text-sm text-ink">No screenings match</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Try a wider radius, another date, or clear the format filters.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-2xl border border-hairline bg-surface px-4 py-2 text-[11px] font-medium text-ink transition hover:border-brand/30 active:scale-95"
      >
        Reset filters
      </button>
    </div>
  );
}
