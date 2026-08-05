'use client';

import { useEffect } from 'react';
import { getActiveFestivals } from '@/lib/data';
import { isEndingSoon } from '@/lib/utils';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/**
 * Loads which running festivals are in their last few days, once, on mount.
 *
 * Separate from the Festival Focus rail's own fetch (`listFestivals`, in
 * `filter-rail.tsx`): that one distincts names off the `movies` table and only
 * runs once the filter drawer is opened. A badge that says "ends Friday" has
 * to be available the moment a card renders, not the moment someone finds the
 * filter drawer — so this runs from the shell instead, and reads the one
 * source that actually carries an end date, `get_active_festivals()`.
 */
export function useFestivalMeta() {
  const setFestivalsEndingSoon = useDiscoveryStore((s) => s.setFestivalsEndingSoon);

  useEffect(() => {
    getActiveFestivals()
      .then((festivals) => {
        const ending = festivals
          .filter((f) => isEndingSoon(f.screeningEndDate))
          .map((f) => f.name);
        setFestivalsEndingSoon(ending);
      })
      .catch(() => setFestivalsEndingSoon([]));
  }, [setFestivalsEndingSoon]);
}
