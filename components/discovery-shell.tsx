'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { MapPin, LocateFixed, Sun, Moon } from 'lucide-react';

import { SearchBar } from '@/components/navigation/search-bar';
import { FilterRail } from '@/components/filters/filter-rail';
import { BrandMark, BrandLogo } from '@/components/navigation/brand-mark';
import { ResultsSheet } from '@/components/ui/results-sheet';
import { useDiscovery } from '@/hooks/use-discovery';
import { useMapSync } from '@/hooks/use-map-sync';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useTheme } from '@/hooks/use-theme';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { cn } from '@/lib/utils';

// MapLibre touches `window` on import, so the canvas is client-only.
const CinemaMap = dynamic(() => import('@/components/map/cinema-map').then((m) => m.CinemaMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-bg">
      <div className="h-10 w-10 animate-pulse rounded-3xl bg-brand opacity-60" />
    </div>
  ),
});

export function DiscoveryShell() {
  const { mapRef, registerCard, selectFromMap, selectFromList, hoverFromList, fitToResults } =
    useMapSync();
  const { status, requestLocation } = useGeolocation();
  const { theme, toggle } = useTheme();

  useDiscovery();

  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const loading = useDiscoveryStore((s) => s.loading);
  const setCoords = useDiscoveryStore((s) => s.setCoords);
  const coords = useDiscoveryStore((s) => s.coords);

  // Picking a film narrows the map — frame whatever survived the filter.
  const lastFramedMovie = useRef<string | null>(null);
  useEffect(() => {
    const movieId = selectedMovie?.id ?? null;
    if (loading || movieId === lastFramedMovie.current) return;
    lastFramedMovie.current = movieId;
    if (movieId && cinemas.length > 0) fitToResults();
  }, [selectedMovie?.id, loading, cinemas.length, fitToResults]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg">
      <CinemaMap
        mapRef={mapRef}
        theme={theme}
        onSelectPin={selectFromMap}
        onRecenter={() => {
          if (status === 'granted') setCoords(coords, true);
          else requestLocation();
        }}
        onFitResults={fitToResults}
      />

      {/* Floating header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4 lg:right-[380px]">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
            <div className="flex items-center gap-2.5">
              <BrandLogo />
              <BrandMark className="text-xl sm:text-2xl" />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestLocation}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-[10px] font-medium transition active:scale-95',
                  status === 'granted'
                    ? 'border-secondary/40 bg-secondarysoft text-secondarysoftfg'
                    : 'border-hairline bg-card text-muted hover:text-ink',
                )}
              >
                {status === 'granted' ? (
                  <LocateFixed className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {status === 'granted'
                  ? 'Near you'
                  : status === 'locating'
                    ? 'Locating…'
                    : 'Use my location'}
              </button>

              <button
                type="button"
                onClick={toggle}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-hairline bg-card text-muted transition hover:text-ink active:scale-95"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <SearchBar />
          <FilterRail />
        </div>
      </header>

      <ResultsSheet
        registerCard={registerCard}
        onSelectCard={selectFromList}
        onHoverCard={hoverFromList}
      />
    </main>
  );
}
