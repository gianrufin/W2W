'use client';

import { create } from 'zustand';
import type {
  CategoryFilter,
  CinemaWithShowtimes,
  Coordinates,
  MovieSearchResult,
  ScreenFormat,
} from '@/types';
import { manilaDateKey } from '@/lib/utils';

/** Manila city hall — the fallback origin when geolocation is denied. */
export const DEFAULT_COORDS: Coordinates = { lat: 14.5995, lng: 120.9842 };

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

interface DiscoveryState {
  // --- query -----------------------------------------------------------------
  coords: Coordinates;
  usingRealLocation: boolean;
  radiusMeters: number;
  date: string;
  category: CategoryFilter;
  formats: ScreenFormat[];
  selectedMovie: MovieSearchResult | null;
  festival: string | null;
  searchTerm: string;

  // --- results ---------------------------------------------------------------
  cinemas: CinemaWithShowtimes[];
  loading: boolean;
  error: string | null;

  // --- map / list sync -------------------------------------------------------
  selectedCinemaId: string | null;
  hoveredCinemaId: string | null;
  viewport: MapViewport;
  /** Bumped whenever something should force the map to fly. */
  flyToken: number;

  // --- actions ---------------------------------------------------------------
  setCoords: (coords: Coordinates, real?: boolean) => void;
  setRadius: (meters: number) => void;
  setDate: (date: string) => void;
  setCategory: (category: CategoryFilter) => void;
  toggleFormat: (format: ScreenFormat) => void;
  clearFormats: () => void;
  setSelectedMovie: (movie: MovieSearchResult | null) => void;
  setFestival: (festival: string | null) => void;
  setSearchTerm: (term: string) => void;
  setResults: (cinemas: CinemaWithShowtimes[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectCinema: (id: string | null, opts?: { fly?: boolean }) => void;
  hoverCinema: (id: string | null) => void;
  setViewport: (viewport: MapViewport) => void;
  resetFilters: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  coords: DEFAULT_COORDS,
  usingRealLocation: false,
  radiusMeters: 15_000,
  date: manilaDateKey(),
  category: 'All',
  formats: [],
  selectedMovie: null,
  festival: null,
  searchTerm: '',

  cinemas: [],
  loading: true,
  error: null,

  selectedCinemaId: null,
  hoveredCinemaId: null,
  viewport: { latitude: DEFAULT_COORDS.lat, longitude: DEFAULT_COORDS.lng, zoom: 11.2 },
  flyToken: 0,

  setCoords: (coords, real = false) =>
    set((s) => ({
      coords,
      usingRealLocation: real,
      viewport: { ...s.viewport, latitude: coords.lat, longitude: coords.lng },
      flyToken: s.flyToken + 1,
    })),

  setRadius: (radiusMeters) => set({ radiusMeters }),
  setDate: (date) => set({ date, selectedCinemaId: null }),

  // Category and Premium are mutually exclusive lenses on the same result set,
  // so switching category drops any explicit format picks.
  setCategory: (category) => set({ category, formats: [], selectedCinemaId: null }),

  toggleFormat: (format) =>
    set((s) => ({
      formats: s.formats.includes(format)
        ? s.formats.filter((f) => f !== format)
        : [...s.formats, format],
      selectedCinemaId: null,
    })),

  clearFormats: () => set({ formats: [] }),

  setSelectedMovie: (movie) =>
    set({
      selectedMovie: movie,
      searchTerm: movie?.title ?? '',
      selectedCinemaId: null,
    }),

  setFestival: (festival) =>
    set({
      festival,
      // Festival Focus implies the indie/festival lens.
      category: festival ? 'Indie/Festival' : 'All',
      selectedCinemaId: null,
    }),

  setSearchTerm: (searchTerm) => set({ searchTerm }),

  setResults: (cinemas) =>
    set((s) => ({
      cinemas,
      // Drop a selection that filtered itself off the map.
      selectedCinemaId: cinemas.some((c) => c.id === s.selectedCinemaId)
        ? s.selectedCinemaId
        : null,
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  selectCinema: (id, opts = {}) => {
    const { fly = true } = opts;
    const cinema = get().cinemas.find((c) => c.id === id);
    set((s) => ({
      selectedCinemaId: id,
      viewport:
        fly && cinema
          ? { latitude: cinema.lat, longitude: cinema.lng, zoom: Math.max(s.viewport.zoom, 13.5) }
          : s.viewport,
      flyToken: fly && cinema ? s.flyToken + 1 : s.flyToken,
    }));
  },

  hoverCinema: (hoveredCinemaId) => set({ hoveredCinemaId }),
  setViewport: (viewport) => set({ viewport }),

  resetFilters: () =>
    set({
      category: 'All',
      formats: [],
      selectedMovie: null,
      festival: null,
      searchTerm: '',
      date: manilaDateKey(),
      selectedCinemaId: null,
    }),
}));
