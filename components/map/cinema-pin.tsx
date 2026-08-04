'use client';

import { Clapperboard, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes } from '@/types';

/**
 * Squircle map marker.
 *
 * Crimson for the commercial chains, amber for microcinemas and festival
 * venues. The badge count is the number of upcoming screenings at that venue
 * under the current filters, so the map itself communicates density.
 */
export function CinemaPin({
  cinema,
  selected,
  hovered,
  startingSoon,
  onClick,
}: {
  cinema: CinemaWithShowtimes;
  selected: boolean;
  hovered: boolean;
  startingSoon: boolean;
  onClick: () => void;
}) {
  const indie = isIndieChain(cinema.chain);
  const active = selected || hovered;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${cinema.name}, ${cinema.showtimes.length} screenings`}
      className={cn(
        'relative flex items-center justify-center transition-transform duration-200',
        active ? 'z-30 scale-110' : 'z-10 hover:scale-105',
      )}
    >
      {startingSoon && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-2xl animate-pulse-ring',
            indie ? 'bg-indie-500/50' : 'bg-crimson-500/50',
          )}
        />
      )}

      <span
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-2xl border backdrop-blur-sm',
          indie
            ? 'border-indie-300/40 bg-gradient-to-br from-indie-400 to-indie-600 shadow-pin-indie'
            : 'border-crimson-200/30 bg-gradient-to-br from-crimson-500 to-crimson-600 shadow-pin',
          active && 'ring-2 ring-white/70',
        )}
      >
        {indie ? (
          <Sparkles className="h-4 w-4 text-amber-50" />
        ) : (
          <Clapperboard className="h-4 w-4 text-white" />
        )}

        <span
          className={cn(
            'absolute -right-1.5 -top-1.5 min-w-[17px] rounded-md border border-white/20 px-1 text-[9px] font-bold leading-[15px] text-white',
            indie ? 'bg-amber-900' : 'bg-zinc-950',
          )}
        >
          {cinema.showtimes.length > 99 ? '99+' : cinema.showtimes.length}
        </span>
      </span>

      {/* Name label only when the pin is the focus — otherwise the map gets noisy. */}
      {active && (
        <span className="pointer-events-none absolute top-full mt-1.5 max-w-[160px] truncate rounded-lg border border-white/10 bg-zinc-950/90 px-2 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-md">
          {cinema.name}
        </span>
      )}
    </button>
  );
}
