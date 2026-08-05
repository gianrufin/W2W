'use client';

import { useEffect, useRef } from 'react';
import { fetchNearbyCinemas } from '@/lib/data';
import { readResultsCache, writeResultsCache } from '@/lib/results-cache';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/**
 * How long the query waits for the inputs to settle before it runs.
 *
 * Opening the app changes the query three times in about 50ms: the Manila
 * default renders, the geolocation permission resolves, and the map flies to
 * the user — each a legitimate dependency change, all describing one intent.
 *
 * Firing all three took the app down in production. The radius scan costs ~2s
 * against a 3s statement timeout, so three concurrent copies starved each other
 * and two came back `57014 canceling statement due to statement timeout` — which
 * the UI correctly, and uselessly, reported as "Schedule data unavailable".
 *
 * 250ms is longer than that burst and shorter than a person notices.
 */
const SETTLE_MS = 250;

/**
 * Runs the discovery query whenever any part of it changes.
 *
 * Three things keep concurrent queries from piling up, in order of how much
 * work they save: the debounce above stops a burst becoming several queries at
 * all; the abort signal cancels whatever is still in flight when a new query
 * starts, handing the database budget to the one the user is waiting on; and
 * the sequence number is the last line of defence, so a straggler that lands
 * anyway cannot overwrite fresher results.
 */
export function useDiscovery() {
  const coords = useDiscoveryStore((s) => s.searchCenter);
  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const radiusMeters = useDiscoveryStore((s) => s.radiusMeters);
  const date = useDiscoveryStore((s) => s.date);
  const category = useDiscoveryStore((s) => s.category);
  const formats = useDiscoveryStore((s) => s.formats);
  const festival = useDiscoveryStore((s) => s.festival);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const online = useDiscoveryStore((s) => s.online);

  const setResults = useDiscoveryStore((s) => s.setResults);
  const setStaleResults = useDiscoveryStore((s) => s.setStaleResults);
  const setLoading = useDiscoveryStore((s) => s.setLoading);
  const setError = useDiscoveryStore((s) => s.setError);

  const formatKey = formats.join('|');
  const requestId = useRef(0);

  useEffect(() => {
    // The spinner goes up immediately even though the query is still settling:
    // the app is busy on the user's behalf from the moment they act, and
    // waiting 250ms to say so reads as a stutter.
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    const timer = setTimeout(() => {
      const id = ++requestId.current;

      fetchNearbyCinemas(
        {
          coords,
          userCoords,
          radiusMeters,
          date,
          category,
          formats,
          festival,
          movieId: selectedMovie?.id ?? null,
        },
        controller.signal,
      )
        .then((cinemas) => {
          if (id !== requestId.current) return;
          setResults(cinemas);
          // Kept for the next time the network is not there — see the note in
          // results-cache.ts on why this lives outside the service worker.
          writeResultsCache(cinemas);
        })
        .catch((err: Error) => {
          if (id !== requestId.current) return;
          // Our own cancellation is not a failure to report.
          if (controller.signal.aborted) return;

          const cached = readResultsCache();
          if (cached) {
            // A cached schedule beats an empty map — the banner in the shell
            // says how old it is, so nobody mistakes it for live.
            setStaleResults(cached.cinemas, cached.fetchedAt);
            return;
          }
          // No fallback to fall back to: surfaced verbatim in the empty state,
          // since a config or query failure is a different problem from
          // "nothing is screening" and must not look the same.
          setError(err.message);
          setResults([]);
        })
        .finally(() => {
          if (id === requestId.current && !controller.signal.aborted) setLoading(false);
        });
    }, SETTLE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `formats` is covered by formatKey; listing the array would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    coords.lat,
    coords.lng,
    userCoords?.lat,
    userCoords?.lng,
    radiusMeters,
    date,
    category,
    formatKey,
    festival,
    selectedMovie?.id,
    // Not read inside the effect — it exists purely to re-fire on reconnect,
    // so a plan saved offline gets a live schedule the moment the network
    // comes back rather than waiting for some other input to change first.
    online,
  ]);
}
