'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sun, Moon, Loader2, Search, SlidersHorizontal } from 'lucide-react';

import { SearchBar } from '@/components/navigation/search-bar';
import { FilterRail } from '@/components/filters/filter-rail';
import { BrandMark, BrandLogo } from '@/components/navigation/brand-mark';
import { BottomNav } from '@/components/navigation/bottom-nav';
import { ResultsSheet } from '@/components/ui/results-sheet';
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
 * Mobile-first shell.
 *
 * Three layers over one full-bleed map: a floating header, a docked results
 * sheet, and the bottom navigation. The map is never fully covered — the list
 * tells you what is on, the map tells you whether you can get there, and both
 * answers are needed at once.
 */
export function DiscoveryShell() {
  const { status, needsOnboarding, requestLocation, skipLocation } = useGeolocation();
  const { theme, toggle } = useTheme();
  const pwa = usePwa();

  useDiscovery();

  const loading = useDiscoveryStore((s) => s.loading);
  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const goToArea = useDiscoveryStore((s) => s.goToArea);
  const mapMoved = useDiscoveryStore((s) => s.mapMoved);
  const searchVisibleArea = useDiscoveryStore((s) => s.searchVisibleArea);
  const dock = useDiscoveryStore((s) => s.dock);

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Once we know where the user is, open there — but only the first time, so a
  // later "near me" tap is the only thing that yanks the map back.
  const centred = useRef(false);
  useEffect(() => {
    if (!userCoords || centred.current) return;
    centred.current = true;
    goToArea(userCoords, 12.5, null);
  }, [userCoords, goToArea]);

  return (
    <main className="bloom-canvas relative h-dvh w-full overflow-hidden bg-bg">
      <CinemaMap theme={theme} />

      {/* Floating header. Full width on phones, capped on desktop. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto w-full max-w-xl">
          <div className="flex items-center gap-2.5 px-0.5 pb-2.5">
            <BrandLogo />
            <BrandMark className="min-w-0 flex-1 text-[18px]" />

            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-label="Filters"
              aria-expanded={filtersOpen}
              className="glass-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="glass-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <SearchBar />

          {/* The rail is a drawer now — four chips over the list cover the
              common cases, and this holds the long tail without stealing map. */}
          <AnimatePresence initial={false}>{filtersOpen && <FilterRail />}</AnimatePresence>

          {/*
            "Search this area" lives in this column, not over the map. This is
            the topmost click-catching layer, so a button drawn beneath it looked
            pressable but received no taps.
          */}
          {mapMoved && !loading && dock !== 'venue' && (
            <div className="flex justify-center pt-2.5">
              <button
                type="button"
                onClick={searchVisibleArea}
                className="flex animate-fade-in items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-onink shadow-float active:scale-95"
              >
                <Search className="h-3.5 w-3.5" />
                Search this area
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results and navigation share the bottom; the sheet clears the nav. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-30">
        <div className="pointer-events-none absolute inset-x-0 bottom-[62px] top-0">
          <ResultsSheet
            locating={status === 'locating'}
            onLocateMe={() => {
              if (userCoords) goToArea(userCoords, 13, null);
              else requestLocation();
            }}
          />
        </div>
        <BottomNav />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[74px] z-40 px-3">
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
