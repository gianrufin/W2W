'use client';

import type { CinemaWithShowtimes } from '@/types';

/**
 * The last successful discovery result, kept for when the next one fails.
 *
 * The service worker caches the app shell and the map tiles, so the app opens
 * offline — but it never caches Supabase responses, so until now "offline"
 * meant an installed app that opens to an empty map with no explanation
 * better than the same "Schedule data unavailable" text a real outage gets.
 *
 * This is deliberately not part of the service worker: a schedule is stale the
 * moment it is written, and how stale is exactly the thing the UI needs to say
 * out loud, which a cache header cannot do on its own.
 */

const CACHE_KEY = 'w2w:last-results';

interface CachedResults {
  cinemas: CinemaWithShowtimes[];
  fetchedAt: string;
}

export function writeResultsCache(cinemas: CinemaWithShowtimes[]): void {
  try {
    const payload: CachedResults = { cinemas, fetchedAt: new Date().toISOString() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — the fallback just will not be there next time.
  }
}

export function readResultsCache(): CachedResults | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as CachedResults).cinemas) ||
      typeof (parsed as CachedResults).fetchedAt !== 'string'
    ) {
      return null;
    }
    return parsed as CachedResults;
  } catch {
    return null;
  }
}
