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
import { planId, prunePastPlans, readPlans, writePlans, type Plan } from '@/lib/plans';

/** Manila city hall — where the map opens before we know anything better. */
export const DEFAULT_COORDS: Coordinates = { lat: 14.5995, lng: 120.9842 };

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

/**
 * The chip row over the results list.
 *
 * "Last show" is the Filipino LFS question — what is the latest screening I can
 * still make tonight — which every chain's own site buries.
 */
export type QuickFilter = 'Tonight' | 'Soon' | 'Last show' | 'Premium' | 'Indie';

/**
 * How the results list is ordered.
 *
 * "Cheapest" only means anything where a chain publishes a price; Robinsons and
 * Megaworld do, the rest do not, so venues without one sort last rather than
 * pretending to be free.
 */
export type SortMode = 'Nearest' | 'Soonest' | 'Cheapest';

/** Bottom navigation destinations. */
export type AppTab = 'discover' | 'saved' | 'plans';

/**
 * How much of the screen the dock is taking.
 *
 *   peek   — a single bar with the count. The map is clear for navigating,
 *            which is the whole reason this state exists.
 *   list   — the results list, roughly half the screen.
 *   venue  — one cinema's full schedule.
 *
 * `venue` replaces what used to be a separate popup dialog. One surface means
 * one thing to dismiss and one thing floating over the map, instead of a sheet
 * and a modal that could both be open at once.
 */
export type DockState = 'peek' | 'list' | 'venue';

/** Where saved venues persist between visits. */
const SAVED_KEY = 'w2w:saved-cinemas';
/** Where the last few opened venues persist — see `recentlyViewed` below. */
const RECENT_KEY = 'w2w:recent-cinemas';
/** How many recently-viewed venues to remember. */
const RECENT_LIMIT = 8;

function readStringList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Private mode, quota, corrupt value — this is a convenience, not a
    // feature worth crashing the map over.
    return [];
  }
}

function writeStringList(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kept in memory for this session either way.
  }
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
  /**
   * The four-chip row above the results list.
   *
   * "Tonight" and "Soon" narrow what is already loaded — they are about *when*,
   * and re-querying the database to hide two cards would be slower and would
   * make the map flicker. "Premium" and "Indie" change the query itself,
   * because the database is the only thing that knows a venue's formats and
   * chain, so they set `category` too.
   */
  quick: QuickFilter;
  sort: SortMode;
  category: CategoryFilter;
  formats: ScreenFormat[];
  /** Only venues with a published price at or under this survive the list. */
  maxPrice: number | null;
  selectedMovie: MovieSearchResult | null;
  festival: string | null;
  searchTerm: string;
  /** Festival names in the last few days of their run — drives the "ends soon" badge. */
  festivalsEndingSoon: string[];

  // --- results -------------------------------------------------------------
  cinemas: CinemaWithShowtimes[];
  loading: boolean;
  error: string | null;
  /**
   * Set when `cinemas` is actually a cached snapshot shown because the live
   * query failed — the ISO time it was fetched, so the offline banner can say
   * how stale it is instead of just "offline". Null the rest of the time.
   */
  resultsStale: string | null;
  /** The browser's own connectivity signal — see `useOnlineStatus`. */
  online: boolean;

  // --- map -----------------------------------------------------------------
  viewport: MapViewport;
  flyToken: number;
  /** The cinema whose detail sheet is open, if any. */
  openCinemaId: string | null;
  hoveredCinemaId: string | null;

  // --- shell ---------------------------------------------------------------
  tab: AppTab;
  /** Cinema ids the user has hearted. Persisted to localStorage. */
  saved: string[];
  /**
   * Cinema ids opened recently, most-recent-first. Persisted to localStorage.
   * Only ever read filtered against the current result set — see the note on
   * `recentlyViewed` in results-sheet.tsx for why it does not jump areas.
   */
  recentlyViewed: string[];
  /** Screenings the user has committed to. Persisted to localStorage. */
  plans: Plan[];
  /** How much of the screen the dock is taking. */
  dock: DockState;

  // --- actions -------------------------------------------------------------
  searchArea: (center: Coordinates, radiusMeters: number, label?: string | null) => void;
  goToArea: (center: Coordinates, zoom: number, label?: string | null) => void;
  setUserCoords: (coords: Coordinates) => void;
  setMapMoved: (moved: boolean) => void;
  setVisibleRadius: (meters: number) => void;
  /** Re-run the query over whatever the map is currently framing. */
  searchVisibleArea: () => void;
  setDate: (date: string) => void;
  setQuick: (quick: QuickFilter) => void;
  setCategory: (category: CategoryFilter) => void;
  setMaxPrice: (maxPrice: number | null) => void;
  setTab: (tab: AppTab) => void;
  toggleSaved: (cinemaId: string) => void;
  setSort: (sort: SortMode) => void;
  togglePlan: (plan: Omit<Plan, 'id' | 'createdAt'>) => void;
  removePlan: (id: string) => void;
  setDock: (dock: DockState) => void;
  toggleFormat: (format: ScreenFormat) => void;
  clearFormats: () => void;
  setSelectedMovie: (movie: MovieSearchResult | null) => void;
  setFestival: (festival: string | null) => void;
  setFestivalsEndingSoon: (names: string[]) => void;
  setSearchTerm: (term: string) => void;
  setResults: (cinemas: CinemaWithShowtimes[]) => void;
  /** The fallback path: cached results shown in place of a failed query. */
  setStaleResults: (cinemas: CinemaWithShowtimes[], fetchedAt: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setOnline: (online: boolean) => void;
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
  quick: 'Tonight',
  sort: 'Nearest',
  category: 'All',
  formats: [],
  maxPrice: null,
  selectedMovie: null,
  festival: null,
  searchTerm: '',
  festivalsEndingSoon: [],

  cinemas: [],
  loading: true,
  error: null,
  resultsStale: null,
  // Assume online until proven otherwise — SSR/build time has no navigator,
  // and a false "offline" flash on load would be worse than a brief false
  // positive that `useOnlineStatus` corrects within a tick.
  online: true,

  viewport: { latitude: DEFAULT_COORDS.lat, longitude: DEFAULT_COORDS.lng, zoom: 12 },
  flyToken: 0,
  openCinemaId: null,
  hoveredCinemaId: null,

  tab: 'discover',
  saved: readStringList(SAVED_KEY),
  recentlyViewed: readStringList(RECENT_KEY),
  // Pruned on load: a plan for last night's screening is clutter, not history.
  plans: prunePastPlans(readPlans()),
  dock: 'peek',

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

  setQuick: (quick) =>
    set({
      quick,
      // Only the two chips that describe the catalogue touch the query;
      // "Tonight", "Soon" and "Last show" narrow what is already on screen.
      category: quick === 'Premium' ? 'Premium' : quick === 'Indie' ? 'Indie/Festival' : 'All',
      formats: [],
      openCinemaId: null,
    }),

  setSort: (sort) => set({ sort }),

  setCategory: (category) => set({ category, formats: [], openCinemaId: null }),
  // Switching tabs closes whatever venue was open and shows that tab's list —
  // landing on "Saved" collapsed to a peek bar would look like it did nothing.
  setTab: (tab) => set({ tab, openCinemaId: null, dock: 'list' }),
  setDock: (dock) => set((s) => ({ dock, openCinemaId: dock === 'venue' ? s.openCinemaId : null })),

  /** Saving the same screening twice removes it — the button is a toggle. */
  togglePlan: (draft) =>
    set((s) => {
      const id = planId(draft.cinemaId, draft.movieTitle, draft.startTime);
      const plans = s.plans.some((p) => p.id === id)
        ? s.plans.filter((p) => p.id !== id)
        : [...s.plans, { ...draft, id, createdAt: new Date().toISOString() }];
      writePlans(plans);
      return { plans };
    }),

  removePlan: (id) =>
    set((s) => {
      const plans = s.plans.filter((p) => p.id !== id);
      writePlans(plans);
      return { plans };
    }),

  toggleSaved: (cinemaId) =>
    set((s) => {
      const saved = s.saved.includes(cinemaId)
        ? s.saved.filter((id) => id !== cinemaId)
        : [...s.saved, cinemaId];
      writeStringList(SAVED_KEY, saved);
      return { saved };
    }),

  toggleFormat: (format) =>
    set((s) => ({
      formats: s.formats.includes(format)
        ? s.formats.filter((f) => f !== format)
        : [...s.formats, format],
      openCinemaId: null,
    })),

  clearFormats: () => set({ formats: [] }),

  setMaxPrice: (maxPrice) => set({ maxPrice, openCinemaId: null }),

  setSelectedMovie: (movie) =>
    set({ selectedMovie: movie, searchTerm: movie?.title ?? '', openCinemaId: null }),

  setFestival: (festival) =>
    set({ festival, category: festival ? 'Indie/Festival' : 'All', openCinemaId: null }),

  setFestivalsEndingSoon: (festivalsEndingSoon) => set({ festivalsEndingSoon }),

  setSearchTerm: (searchTerm) => set({ searchTerm }),

  setResults: (cinemas) =>
    set((s) => ({
      cinemas,
      // A fresh, successful result always wins over a stale one.
      resultsStale: null,
      // Close a sheet whose venue just filtered itself out of the results.
      openCinemaId: cinemas.some((c) => c.id === s.openCinemaId) ? s.openCinemaId : null,
    })),

  setStaleResults: (cinemas, fetchedAt) =>
    set((s) => ({
      cinemas,
      resultsStale: fetchedAt,
      openCinemaId: cinemas.some((c) => c.id === s.openCinemaId) ? s.openCinemaId : null,
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setOnline: (online) => set({ online }),

  // Tapping a pin expands the dock straight to that venue; dismissing it
  // returns to the list rather than all the way to the peek bar, because you
  // were browsing before you tapped.
  openCinema: (openCinemaId) =>
    set((s) => {
      let recentlyViewed = s.recentlyViewed;
      if (openCinemaId) {
        recentlyViewed = [
          openCinemaId,
          ...s.recentlyViewed.filter((id) => id !== openCinemaId),
        ].slice(0, RECENT_LIMIT);
        writeStringList(RECENT_KEY, recentlyViewed);
      }
      return {
        openCinemaId,
        dock: openCinemaId ? 'venue' : s.dock === 'venue' ? 'list' : s.dock,
        recentlyViewed,
      };
    }),
  hoverCinema: (hoveredCinemaId) => set({ hoveredCinemaId }),
  setViewport: (viewport) => set({ viewport }),

  resetFilters: () =>
    set({
      category: 'All',
      formats: [],
      maxPrice: null,
      selectedMovie: null,
      festival: null,
      searchTerm: '',
      date: manilaDateKey(),
      openCinemaId: null,
    }),
}));
