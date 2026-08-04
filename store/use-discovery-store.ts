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

/** Manila city hall — where the map opens before we know anything better. */
export const DEFAULT_COORDS: Coordinates = { lat: 14.5995, lng: 120.9842 };

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

interface DiscoveryState {
  // --- where we are searching --------------------------------------------
  /** The centre the current results belong to. Not necessarily the user. */
  searchCenter: Coordinates;
  /** Radius of the current query, derived from what the map is showing. */
  radiusMeters: number;
  /**
   * What the map is showing *right now*, which is not the same as
   * `radiusMeters` until the user asks for a new search. Kept here so the
   * "Search this area" control can live outside the map — it used to sit inside
   * the map layer, underneath the header's own click-catching box, and was
   * therefore impossible to tap.
   */
  visibleRadiusMeters: number;
  /** Set once geolocation succeeds; lets "near me" return home. */
  userCoords: Coordinates | null;
  /** Human label for the area being searched, e.g. "Cebu City". */
  areaLabel: string | null;
  /**
   * True when the map has been panned away from `searchCenter`. Drives the
   * "Search this area" button — results are never refetched behind the user's
   * back, because silently changing what is on screen while they are reading it
   * is worse than making them ask.
   */
  mapMoved: boolean;

  // --- filters -------------------------------------------------------------
  date: string;
  category: CategoryFilter;
  formats: ScreenFormat[];
  selectedMovie: MovieSearchResult | null;
  festival: string | null;
  searchTerm: string;

  // --- results -------------------------------------------------------------
  cinemas: CinemaWithShowtimes[];
  loading: boolean;
  error: string | null;

  // --- map -----------------------------------------------------------------
  viewport: MapViewport;
  flyToken: number;
  /** The cinema whose detail sheet is open, if any. */
  openCinemaId: string | null;
  hoveredCinemaId: string | null;

  // --- actions -------------------------------------------------------------
  searchArea: (center: Coordinates, radiusMeters: number, label?: string | null) => void;
  goToArea: (center: Coordinates, zoom: number, label?: string | null) => void;
  setUserCoords: (coords: Coordinates) => void;
  setMapMoved: (moved: boolean) => void;
  setVisibleRadius: (meters: number) => void;
  /** Re-run the query over whatever the map is currently framing. */
  searchVisibleArea: () => void;
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
  openCinema: (id: string | null) => void;
  hoverCinema: (id: string | null) => void;
  setViewport: (viewport: MapViewport) => void;
  resetFilters: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set) => ({
  searchCenter: DEFAULT_COORDS,
  radiusMeters: 15_000,
  visibleRadiusMeters: 15_000,
  userCoords: null,
  areaLabel: null,
  mapMoved: false,

  date: manilaDateKey(),
  category: 'All',
  formats: [],
  selectedMovie: null,
  festival: null,
  searchTerm: '',

  cinemas: [],
  loading: true,
  error: null,

  viewport: { latitude: DEFAULT_COORDS.lat, longitude: DEFAULT_COORDS.lng, zoom: 12 },
  flyToken: 0,
  openCinemaId: null,
  hoveredCinemaId: null,

  /** Re-query around a centre without moving the map (the "search this area" path). */
  searchArea: (searchCenter, radiusMeters, areaLabel = null) =>
    set((s) => ({
      searchCenter,
      radiusMeters,
      areaLabel: areaLabel ?? s.areaLabel,
      mapMoved: false,
      openCinemaId: null,
    })),

  /** Move the map somewhere and search there — used by place search and "near me". */
  goToArea: (center, zoom, areaLabel = null) =>
    set((s) => ({
      searchCenter: center,
      areaLabel,
      mapMoved: false,
      openCinemaId: null,
      viewport: { latitude: center.lat, longitude: center.lng, zoom },
      flyToken: s.flyToken + 1,
    })),

  setUserCoords: (userCoords) => set({ userCoords }),
  setMapMoved: (mapMoved) => set({ mapMoved }),
  setVisibleRadius: (visibleRadiusMeters) => set({ visibleRadiusMeters }),

  searchVisibleArea: () =>
    set((s) => ({
      searchCenter: { lat: s.viewport.latitude, lng: s.viewport.longitude },
      radiusMeters: s.visibleRadiusMeters,
      // The label belonged to wherever we were before; the user has moved on.
      areaLabel: null,
      mapMoved: false,
      openCinemaId: null,
    })),

  setDate: (date) => set({ date, openCinemaId: null }),
  setCategory: (category) => set({ category, formats: [], openCinemaId: null }),

  toggleFormat: (format) =>
    set((s) => ({
      formats: s.formats.includes(format)
        ? s.formats.filter((f) => f !== format)
        : [...s.formats, format],
      openCinemaId: null,
    })),

  clearFormats: () => set({ formats: [] }),

  setSelectedMovie: (movie) =>
    set({ selectedMovie: movie, searchTerm: movie?.title ?? '', openCinemaId: null }),

  setFestival: (festival) =>
    set({ festival, category: festival ? 'Indie/Festival' : 'All', openCinemaId: null }),

  setSearchTerm: (searchTerm) => set({ searchTerm }),

  setResults: (cinemas) =>
    set((s) => ({
      cinemas,
      // Close a sheet whose venue just filtered itself out of the results.
      openCinemaId: cinemas.some((c) => c.id === s.openCinemaId) ? s.openCinemaId : null,
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  openCinema: (openCinemaId) => set({ openCinemaId }),
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
      openCinemaId: null,
    }),
}));
