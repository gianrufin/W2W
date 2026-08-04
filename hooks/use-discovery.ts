'use client';

import { useEffect, useRef } from 'react';
import { fetchNearbyCinemas } from '@/lib/data';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/**
 * Runs the discovery query whenever any part of it changes.
 *
 * Each run carries a sequence number; a response is only applied if it belongs
 * to the newest request, so a slow query for an earlier filter cannot overwrite
 * the results the user is currently looking at.
 */
export function useDiscovery() {
  const coords = useDiscoveryStore((s) => s.coords);
  const radiusMeters = useDiscoveryStore((s) => s.radiusMeters);
  const date = useDiscoveryStore((s) => s.date);
  const category = useDiscoveryStore((s) => s.category);
  const formats = useDiscoveryStore((s) => s.formats);
  const festival = useDiscoveryStore((s) => s.festival);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);

  const setResults = useDiscoveryStore((s) => s.setResults);
  const setLoading = useDiscoveryStore((s) => s.setLoading);
  const setError = useDiscoveryStore((s) => s.setError);

  const formatKey = formats.join('|');
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    fetchNearbyCinemas({
      coords,
      radiusMeters,
      date,
      category,
      formats,
      festival,
      movieId: selectedMovie?.id ?? null,
    })
      .then((cinemas) => {
        if (id !== requestId.current) return;
        setResults(cinemas);
      })
      .catch((err: Error) => {
        if (id !== requestId.current) return;
        // Surfaced verbatim in the empty state — a config or query failure is a
        // different problem from "nothing is screening", and must not look the same.
        setError(err.message);
        setResults([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // `formats` is covered by formatKey; listing the array would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    coords.lat,
    coords.lng,
    radiusMeters,
    date,
    category,
    formatKey,
    festival,
    selectedMovie?.id,
  ]);
}
