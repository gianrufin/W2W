'use client';

import { useEffect, useRef, useState } from 'react';
import { estimateTravel, type TravelEstimate } from '@/lib/travel';
import type { Coordinates } from '@/types';

/**
 * Travel estimate for one venue, cached.
 *
 * The cache is the reason this is a hook rather than a call in a component.
 * A venue panel with eight showtimes must not make eight routing requests, and
 * reopening the same cinema a minute later must not make a ninth. One estimate
 * per (origin, destination, departure quarter-hour), held for ten minutes.
 *
 * Quantising the departure to fifteen minutes is what makes the key hit: two
 * screenings an hour apart genuinely need different predictions, but a request
 * made at 6:01 and one at 6:04 do not.
 */

interface CacheEntry {
  value: TravelEstimate | null;
  at: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60_000;

function cacheKey(from: Coordinates, to: Coordinates, departAt: Date): string {
  const quarter = Math.floor(departAt.getTime() / (15 * 60_000));
  return [
    from.lat.toFixed(3),
    from.lng.toFixed(3),
    to.lat.toFixed(4),
    to.lng.toFixed(4),
    quarter,
  ].join('|');
}

export function useTravelEstimate(
  from: Coordinates | null,
  to: Coordinates,
  departAt: Date | null,
): TravelEstimate | null {
  const [estimate, setEstimate] = useState<TravelEstimate | null>(null);
  const requestId = useRef(0);

  const key = from && departAt ? cacheKey(from, to, departAt) : null;

  useEffect(() => {
    if (!from || !departAt || !key) {
      setEstimate(null);
      return;
    }

    const cached = CACHE.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) {
      setEstimate(cached.value);
      return;
    }

    const id = ++requestId.current;
    estimateTravel({ from, to, departAt })
      .then((value) => {
        // A null is a real answer — no provider could estimate this trip — so
        // it is cached like any other, or every render would ask again.
        CACHE.set(key, { value, at: Date.now() });
        // A slow response for a venue the user has already closed must not
        // overwrite the one they are looking at now.
        if (id === requestId.current) setEstimate(value);
      })
      .catch(() => {
        if (id === requestId.current) setEstimate(null);
      });
    // `key` already encodes from/to/departAt; listing the objects would re-run
    // on every render because they are new references each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return estimate;
}
