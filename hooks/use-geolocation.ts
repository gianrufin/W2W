'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDiscoveryStore, DEFAULT_COORDS } from '@/store/use-discovery-store';

export type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

const ONBOARDED_KEY = 'w2w-location-onboarded';

/**
 * Browser position, with Manila city hall as the fallback.
 *
 * The prompt is never fired on mount. Browsers only grant a meaningful prompt
 * off a user gesture, and a cold permission dialog on first paint is the
 * fastest way to get a permanent "block". The onboarding gate explains why we
 * want the location and then calls `requestLocation` from a real click.
 */
export function useGeolocation() {
  const setCoords = useDiscoveryStore((s) => s.setCoords);
  const [status, setStatus] = useState<GeoStatus>('idle');
  /** Null until we have read localStorage, so the gate does not flash. */
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setNeedsOnboarding(false);
      return;
    }

    let seen = false;
    try {
      seen = window.localStorage.getItem(ONBOARDED_KEY) === 'true';
    } catch {
      // Private mode — treat as first run.
    }

    // If permission was already granted in a previous session we can locate
    // silently: the browser will not show a dialog, so there is nothing to
    // explain and no gesture required.
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((perm) => {
        if (perm.state === 'granted') {
          setNeedsOnboarding(false);
          locate();
        } else if (perm.state === 'denied') {
          setStatus('denied');
          setCoords(DEFAULT_COORDS, false);
          setNeedsOnboarding(false);
        } else {
          setNeedsOnboarding(!seen);
          if (seen) setCoords(DEFAULT_COORDS, false);
        }
      })
      .catch(() => {
        // Permissions API unavailable (older Safari) — fall back to the gate.
        setNeedsOnboarding(!seen);
      });
    // `locate` is stable for our purposes; re-running would re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }, true);
        setStatus('granted');
      },
      () => {
        setCoords(DEFAULT_COORDS, false);
        setStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [setCoords]);

  const markOnboarded = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, 'true');
    } catch {
      // Non-fatal — the gate reappears next session.
    }
    setNeedsOnboarding(false);
  }, []);

  /** Called from the gate's "Allow location" button — a real user gesture. */
  const requestLocation = useCallback(() => {
    markOnboarded();
    locate();
  }, [markOnboarded, locate]);

  /** "Not now" — browse from Manila, no prompt fired. */
  const skipLocation = useCallback(() => {
    markOnboarded();
    setCoords(DEFAULT_COORDS, false);
    setStatus('idle');
  }, [markOnboarded, setCoords]);

  return { status, needsOnboarding, requestLocation, skipLocation };
}
