import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { manilaDayRange } from '@/lib/utils';
import type {
  CategoryFilter,
  CinemaWithShowtimes,
  DiscoveryQuery,
  MovieSearchResult,
} from '@/types';

/**
 * Data layer.
 *
 * Supabase is the only source. There is deliberately no sample dataset behind
 * this: a cinema app that invents screenings is worse than one that admits it
 * has none, because a wrong showtime sends someone to a cinema for nothing.
 * When the database is empty the UI says so.
 */

export class DataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataUnavailableError';
  }
}

/** UI category filter → the `movies.category` values the RPC expects. */
function categoriesFor(filter: CategoryFilter): string[] | null {
  switch (filter) {
    case 'Mainstream':
      return ['Mainstream'];
    case 'Indie/Festival':
      return ['Indie', 'Festival', 'Special Screening'];
    default:
      return null;
  }
}

/** "Premium" is a format filter, not a category one. */
const PREMIUM_FORMAT_SET = [
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

function formatsFor(query: DiscoveryQuery): string[] | null {
  if (query.formats.length) return query.formats;
  if (query.category === 'Premium') return PREMIUM_FORMAT_SET;
  return null;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new DataUnavailableError(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return client;
}

export { isSupabaseConfigured };

export async function fetchNearbyCinemas(query: DiscoveryQuery): Promise<CinemaWithShowtimes[]> {
  const client = requireClient();
  const { start, end } = manilaDayRange(query.date);
  // Never surface a screening that already started.
  const from = new Date(Math.max(Date.parse(start), Date.now())).toISOString();

  const { data, error } = await client.rpc('get_nearby_cinemas_for_movie', {
    user_lat: query.coords.lat,
    user_lng: query.coords.lng,
    search_movie_id: query.movieId ?? null,
    radius_meters: query.radiusMeters,
    from_time: from,
    until_time: end,
    formats: formatsFor(query),
    categories: categoriesFor(query.category),
    festival: query.festival ?? null,
  });

  if (error) throw new DataUnavailableError(error.message);

  return ((data ?? []) as RpcCinemaRow[]).map((row) => ({
    id: row.cinema_id,
    name: row.name,
    slug: row.slug,
    chain: row.chain as CinemaWithShowtimes['chain'],
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    city: row.city,
    website_url: row.website_url,
    logo_url: row.logo_url,
    distance_km: row.distance_km,
    showtimes: row.showtimes ?? [],
  }));
}

interface RpcCinemaRow {
  cinema_id: string;
  name: string;
  slug: string;
  chain: string;
  address: string | null;
  city: string | null;
  website_url: string | null;
  logo_url: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  showtimes: CinemaWithShowtimes['showtimes'];
}

export async function searchMovies(term: string, limit = 12): Promise<MovieSearchResult[]> {
  const client = requireClient();
  const { data, error } = await client.rpc('search_movies_with_showtimes', {
    search_term: term,
    max_results: limit,
  });
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []) as MovieSearchResult[];
}

export async function listFestivals(): Promise<string[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('movies')
    .select('festival_name')
    .not('festival_name', 'is', null);
  if (error || !data) return [];

  return [...new Set(data.map((r) => r.festival_name as string))].sort();
}

export async function getMovieById(id: string) {
  const client = requireClient();
  const { data, error } = await client.from('movies').select('*').eq('id', id).single();
  if (error) throw new DataUnavailableError(error.message);
  return data;
}
