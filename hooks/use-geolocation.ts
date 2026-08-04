'use client';

import { useEffect, useState } from 'react';
import { useDiscoveryStore, DEFAULT_COORDS } from '@/store/use-discovery-store';

export type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

/**
 * Ask once for the browser's position, then fall back to Manila city hall.
 * The map is usable either way — a denied prompt should never be a dead end.
 */
export function useGeolocation() {
  const setCoords = useDiscoveryStore((s) => s.setCoords);
  const [status, setStatus] = useState<GeoStatus>('idle');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    setStatus('locating');
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setCoords(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          true,
        );
        setStatus('granted');
      },
      () => {
        if (cancelled) return;
        setCoords(DEFAULT_COORDS, false);
        setStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 300_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [setCoords]);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }, true);
        setStatus('granted');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  };

  return { status, requestLocation };
}
