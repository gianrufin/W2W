'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sun, Moon, Loader2 } from 'lucide-react';

import { SearchBar } from '@/components/navigation/search-bar';
import { FilterRail } from '@/components/filters/filter-rail';
import { BrandMark } from '@/components/navigation/brand-mark';
import { CinemaSheet } from '@/components/ui/cinema-sheet';
import { useDiscovery } from '@/hooks/use-discovery';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useTheme } from '@/hooks/use-theme';
import { usePwa } from '@/hooks/use-pwa';
import { LocationGate } from '@/components/onboarding/location-gate';
import { InstallBanner } from '@/components/pwa/install-banner';
import { useDiscoveryStore } from '@/store/use-discovery-store';

// MapLibre touches `window` on import, so the canvas is client-only.
const CinemaMap = dynamic(() => import('@/components/map/cinema-map').then((m) => m.CinemaMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-bg">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  ),
});

/**
 * Mobile-first shell: the map owns the viewport, and a single floating column
 * of controls sits over it. No persistent results list — tapping a pin opens
 * the cinema sheet, which is the only place a schedule appears.
 */
export function DiscoveryShell() {
  const { status, needsOnboarding, requestLocation, skipLocation } = useGeolocation();
  const { theme, toggle } = useTheme();
  const pwa = usePwa();

  useDiscovery();

  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const loading = useDiscoveryStore((s) => s.loading);
  const error = useDiscoveryStore((s) => s.error);
  const areaLabel = useDiscoveryStore((s) => s.areaLabel);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const goToArea = useDiscoveryStore((s) => s.goToArea);

  // Once we know where the user is, open there — but only the first time, so a
  // later "near me" tap is the only thing that yanks the map back.
  const centred = useRef(false);
  useEffect(() => {
    if (!userCoords || centred.current) return;
    centred.current = true;
    goToArea(userCoords, 12.5, null);
  }, [userCoords, goToArea]);

  const totalShowtimes = cinemas.reduce((n, c) => n + c.showtimes.length, 0);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg">
      <CinemaMap
        theme={theme}
        locating={status === 'locating'}
        onLocateMe={() => {
          if (userCoords) goToArea(userCoords, 13, null);
          else requestLocation();
        }}
      />

      {/* Floating controls. One column, full width on phones, capped on desktop. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto w-full max-w-xl">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <BrandMark className="text-[17px]" />
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="glass-panel flex h-9 w-9 items-center justify-center rounded-full text-muted active:scale-95"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <SearchBar />
          <FilterRail />
        </div>
      </div>

      {/* Status strip: what the current query actually found. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
        <div className="glass-panel font-numeric max-w-[calc(100%-4rem)] truncate rounded-full px-4 py-2 text-[12px] text-muted shadow-float">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </span>
          ) : error ? (
            <span className="text-brand">Schedule data unavailable</span>
          ) : cinemas.length === 0 ? (
            <span>No screenings {areaLabel ? `in ${areaLabel}` : 'in this area'}</span>
          ) : (
            <>
              <span className="text-ink">{cinemas.length}</span>{' '}
              {cinemas.length === 1 ? 'cinema' : 'cinemas'} ·{' '}
              <span className="text-ink">{totalShowtimes}</span> showtimes
              {selectedMovie ? (
                <span className="text-brand"> · {selectedMovie.title}</span>
              ) : areaLabel ? (
                <span> · {areaLabel}</span>
              ) : null}
            </>
          )}
        </div>
      </div>

      <CinemaSheet />

      <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 px-3">
        <div className="mx-auto max-w-xl">
          <AnimatePresence>
            {pwa.canInstall && (
              <InstallBanner onInstall={pwa.promptInstall} onDismiss={pwa.dismiss} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {needsOnboarding && (
          <LocationGate
            onAllow={requestLocation}
            onSkip={skipLocation}
            locating={status === 'locating'}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
