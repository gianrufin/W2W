export type CinemaChain =
  | 'SM'
  | 'Ayala'
  | 'Vista'
  | 'Robinsons'
  | 'Megaworld'
  | 'Fisher'
  | 'Newport'
  | 'ShangriLa'
  /** Araneta City — Gateway Cineplex 18 and Gateway Mall 2, ticketed via TicketNet. */
  | 'Araneta'
  | 'Microcinema'
  | 'Independent'
  | 'FestivalVenue';

export type MovieCategory = 'Mainstream' | 'Indie' | 'Festival' | 'Special Screening';

export type ScreenFormat =
  | '2D'
  | '3D'
  | 'IMAX'
  | 'IMAX 3D'
  | 'A-Max'
  | 'Giant Screen'
  | 'ScreenX'
  | '4DX'
  | 'Dolby Atmos'
  | "Director's Club"
  | 'A-Luxe'
  | 'VIP';

export const SCREEN_FORMATS: ScreenFormat[] = [
  '2D',
  '3D',
  'IMAX',
  'IMAX 3D',
  'A-Max',
  'Giant Screen',
  'ScreenX',
  '4DX',
  'Dolby Atmos',
  "Director's Club",
  'A-Luxe',
  'VIP',
];

/** Chains we treat as indie/festival — drives the amber vs crimson split. */
export const INDIE_CHAINS: CinemaChain[] = ['Microcinema', 'Independent', 'FestivalVenue'];

export function isIndieChain(chain: CinemaChain): boolean {
  return INDIE_CHAINS.includes(chain);
}

export interface Cinema {
  id: string;
  name: string;
  slug: string;
  chain: CinemaChain;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  website_url?: string | null;
  logo_url?: string | null;
}

export interface Movie {
  id: string;
  title: string;
  slug: string;
  normalized_title: string;
  synopsis?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  rating?: string | null;
  duration_mins?: number | null;
  category: MovieCategory;
  festival_name?: string | null;
  release_date?: string | null;
  genres?: string[];
}

export interface Showtime {
  id: string;
  movie_id: string;
  movie_title: string;
  movie_slug: string;
  poster_url?: string | null;
  category: MovieCategory;
  festival_name?: string | null;
  rating?: string | null;
  duration_mins?: number | null;
  screen_name?: string | null;
  format: ScreenFormat;
  start_time: string;
  booking_url?: string | null;
  ticket_price?: number | null;
}

/** One row of `get_nearby_cinemas_for_movie` — a venue plus its screenings. */
export interface CinemaWithShowtimes extends Cinema {
  distance_km: number;
  showtimes: Showtime[];
}

export interface MovieSearchResult {
  id: string;
  title: string;
  slug: string;
  poster_url?: string | null;
  category: MovieCategory;
  festival_name?: string | null;
  rating?: string | null;
  duration_mins?: number | null;
  showtime_count: number;
  next_showtime: string | null;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type CategoryFilter = 'All' | 'Mainstream' | 'Indie/Festival' | 'Premium';

export interface DiscoveryQuery {
  /**
   * Where to look. Drives the radius search and the ordering of results.
   */
  coords: Coordinates;
  /**
   * Where the user actually is, when known. Distances are measured from here
   * regardless of where the map has been moved to — a cinema does not get
   * closer because you panned towards it.
   */
  userCoords?: Coordinates | null;
  movieId?: string | null;
  radiusMeters: number;
  date: string; // yyyy-MM-dd, local Manila date
  category: CategoryFilter;
  formats: ScreenFormat[];
  festival?: string | null;
}
