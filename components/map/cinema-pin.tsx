'use client';

import { Clapperboard, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes } from '@/types';

/**
 * Map marker.
 *
 * Poster-first, like SpotMo's pins: when the venue's next screening has art we
 * show the poster thumbnail and let the image identify the pin. Falls back to
 * the chain glyph when there is no poster. Crimson ring for commercial chains,
 * amber for microcinemas and festival venues; the badge counts screenings under
 * the current filters, so the map itself communicates density.
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
  const poster = cinema.showtimes.find((s) => s.poster_url)?.poster_url ?? null;

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
            'absolute inset-0 animate-pulse-ring rounded-2xl',
            indie ? 'bg-tertiary/50' : 'bg-brand/50',
          )}
        />
      )}

      <span
        className={cn(
          'relative flex h-11 w-9 items-center justify-center overflow-hidden rounded-2xl border-2 bg-card shadow-pin',
          indie ? 'border-tertiary' : 'border-brand',
          active && 'ring-2 ring-ink/25',
        )}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : indie ? (
          <Sparkles className="h-4 w-4 text-tertiary" />
        ) : (
          <Clapperboard className="h-4 w-4 text-brand" />
        )}
      </span>

      <span
        className={cn(
          'absolute -right-1.5 -top-1.5 min-w-[17px] rounded-lg px-1 text-[9px] font-semibold leading-[15px]',
          indie ? 'bg-tertiary text-ontertiary' : 'bg-brand text-onbrand',
        )}
      >
        {cinema.showtimes.length > 99 ? '99+' : cinema.showtimes.length}
      </span>

      {/* Name label only when the pin is the focus — otherwise the map gets noisy. */}
      {active && (
        <span className="glass-panel pointer-events-none absolute top-full mt-1.5 max-w-[160px] truncate rounded-xl px-2 py-1 text-[10px] font-medium text-ink shadow-float">
          {cinema.name}
        </span>
      )}
    </button>
  );
}
