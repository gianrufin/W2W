'use client';

import { cn, formatShowtime, hasStarted } from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes } from '@/types';

/**
 * Map marker.
 *
 * A pill showing the venue's **next** screening time, because that is the thing
 * a person scanning a map at 5pm actually wants: not how many films are on, but
 * whether they can still make one. A poster thumbnail looked richer but told
 * you nothing you could act on.
 *
 * Crimson for the commercial chains, amber for microcinemas, cinematheques and
 * festival venues — the same split the rest of the app uses. A venue whose
 * whole day has already started shows dimmed rather than disappearing, so the
 * map does not silently lose pins as the evening goes on.
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

  const next =
    cinema.showtimes.find((s) => !hasStarted(s.start_time)) ?? cinema.showtimes[0] ?? null;
  const spent = next ? hasStarted(next.start_time) : true;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${cinema.name}, ${cinema.showtimes.length} screenings${
        next ? `, next at ${formatShowtime(next.start_time)}` : ''
      }`}
      className={cn(
        'relative flex items-center transition-transform duration-200',
        active ? 'z-30 scale-105' : 'z-10 hover:scale-105',
      )}
    >
      {startingSoon && !spent && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 animate-pulse-ring rounded-full',
            indie ? 'bg-tertiary/40' : 'bg-brand/40',
          )}
        />
      )}

      <span
        className={cn(
          'font-numeric relative inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-semibold shadow-pin',
          spent
            ? 'border-hairline bg-card/85 text-muted'
            : indie
              ? 'border-tertiary/70 bg-card text-ink'
              : 'border-brand/70 bg-card text-ink',
          // The selected pin gets the accent as a fill, not just a border —
          // at pin size a border alone is too quiet to find again.
          active && (indie ? 'bg-tertiary text-ontertiary' : 'bg-brand text-onbrand'),
        )}
      >
        <span
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 rounded-full',
            spent ? 'bg-hairline' : indie ? 'bg-tertiary' : 'bg-brand',
            // On a selected pin the pill is filled with the accent, so the dot
            // has to borrow the pill's own foreground colour or it reads as a
            // hole punched in the accent.
            active && 'bg-current',
          )}
        />
        {next ? formatShowtime(next.start_time) : '—'}

        {cinema.showtimes.length > 1 && (
          <span
            className={cn(
              'text-[10px] font-medium',
              active ? 'opacity-70' : 'text-muted',
            )}
          >
            +{cinema.showtimes.length - 1}
          </span>
        )}
      </span>

      {/* Name label only when the pin is the focus — otherwise the map gets noisy. */}
      {active && (
        <span className="glass-panel pointer-events-none absolute left-1/2 top-full mt-1.5 max-w-[170px] -translate-x-1/2 truncate rounded-xl px-2 py-1 text-[10px] font-medium text-ink shadow-float">
          {cinema.name}
        </span>
      )}
    </button>
  );
}
