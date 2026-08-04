'use client';

import { Heart } from 'lucide-react';
import { FormatBadge } from './format-badge';
import {
  cn,
  chainLabel,
  driveMinutes,
  formatShowtime,
  hasStarted,
  startsInLabel,
} from '@/lib/utils';
import { isIndieChain, type CinemaWithShowtimes, type Showtime } from '@/types';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/** How many time chips fit before the row starts counting the rest. */
const VISIBLE_SLOTS = 3;

/**
 * One venue in the results list.
 *
 * Reads top-down in the order the decision gets made: which chain, which
 * cinema, how far, and then the times. The next screening is highlighted rather
 * than merely listed, because on a card with four times the only one that
 * usually matters is the one you can still get to.
 */
export function CinemaRow({
  cinema,
  onOpen,
}: {
  cinema: CinemaWithShowtimes;
  onOpen: () => void;
}) {
  const saved = useDiscoveryStore((s) => s.saved.includes(cinema.id));
  const toggleSaved = useDiscoveryStore((s) => s.toggleSaved);
  const hoverCinema = useDiscoveryStore((s) => s.hoverCinema);

  const indie = isIndieChain(cinema.chain);

  // Upcoming first; if the whole day has passed, show the last few anyway so
  // the venue does not look like it has no schedule at all.
  const upcoming = cinema.showtimes.filter((s) => !hasStarted(s.start_time));
  const slots = (upcoming.length ? upcoming : cinema.showtimes).slice(0, VISIBLE_SLOTS);
  const overflow = (upcoming.length || cinema.showtimes.length) - slots.length;

  const next = upcoming[0] ?? null;
  const countdown = next ? startsInLabel(next.start_time) : null;

  return (
    <li
      onMouseEnter={() => hoverCinema(cinema.id)}
      onMouseLeave={() => hoverCinema(null)}
      className={cn(
        'rounded-3xl border bg-card p-3.5 transition',
        countdown ? 'border-brand/40' : 'border-hairline',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${cinema.name}`}
          className={cn(
            'font-label flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold uppercase',
            indie ? 'bg-tertiarysoft text-tertiarysoftfg' : 'bg-brandsoft text-brandsoftfg',
          )}
        >
          {initials(cinema.name)}
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              'font-label block truncate text-[10px] font-semibold uppercase tracking-widest',
              indie ? 'text-tertiary' : 'text-brand',
            )}
          >
            {chainLabel(cinema.chain)}
          </span>

          <span className="font-title mt-0.5 block truncate text-[15px] font-bold text-ink">
            {cinema.name}
          </span>

          <span className="font-numeric mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
            <span>{cinema.distance_km.toFixed(1)} km</span>
            <span aria-hidden>·</span>
            <span>{driveMinutes(cinema.distance_km)} min drive</span>
            {countdown && (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-brand">{countdown}</span>
              </>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggleSaved(cinema.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${cinema.name} from saved` : `Save ${cinema.name}`}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface active:scale-90"
        >
          <Heart className={cn('h-4 w-4', saved && 'fill-brand text-brand')} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {slots.map((slot) => (
          <SlotChip key={slot.id} slot={slot} highlight={slot.id === next?.id} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="font-numeric inline-flex min-h-[34px] items-center rounded-xl border border-hairline px-2.5 text-[12px] text-muted transition hover:border-brand/30 hover:text-ink active:scale-95"
          >
            +{overflow}
          </button>
        )}
      </div>
    </li>
  );
}

function SlotChip({ slot, highlight }: { slot: Showtime; highlight: boolean }) {
  const started = hasStarted(slot.start_time);

  return (
    <a
      href={slot.booking_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      title={slot.screen_name ?? undefined}
      className={cn(
        'font-numeric inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border px-2.5 text-[12px] transition active:scale-95',
        started
          ? 'border-hairline bg-surface/50 text-muted line-through opacity-60'
          : highlight
            // The next screening is the one decision on the card, so it gets
            // the only filled chip.
            ? 'border-brand bg-brand font-semibold text-onbrand'
            : 'border-hairline bg-surface text-ink hover:border-brand/40',
      )}
    >
      {formatShowtime(slot.start_time)}
      <FormatBadge format={slot.format} size="xs" />
    </a>
  );
}

/** Two-letter mark from the venue name, standing in for a chain logo. */
function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '??';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
