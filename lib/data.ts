import { getSupabaseClient } from '@/lib/supabase/client';
import {
  mockNearbyCinemas,
  mockSearchMovies,
  mockFestivals,
  MOCK_MOVIES,
} from '@/lib/mock-data';
import { manilaDayRange } from '@/lib/utils';
import type {
  CategoryFilter,
  CinemaWithShowtimes,
  DiscoveryQuery,
  MovieSearchResult,
} from '@/types';

/**
 * Single data layer for the app.
 *
 * Every function tries Supabase first and falls back to the bundled mock
 * dataset when the project is unconfigured or the call fails — so the UI is
 * always renderable, and switching to live data is purely an env-var change.
 */

const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

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

export async function fetchNearbyCinemas(query: DiscoveryQuery): Promise<CinemaWithShowtimes[]> {
  const { start, end } = manilaDayRange(query.date);
  // Never surface a screening that already started.
  const from = new Date(Math.max(Date.parse(start), Date.now())).toISOString();
  const formats = formatsFor(query);
  const categories = categoriesFor(query.category);

  const client = FORCE_MOCK ? null : getSupabaseClient();

  if (client) {
    const { data, error } = await client.rpc('get_nearby_cinemas_for_movie', {
      user_lat: query.coords.lat,
      user_lng: query.coords.lng,
      search_movie_id: query.movieId ?? null,
      radius_meters: query.radiusMeters,
      from_time: from,
      until_time: end,
      formats,
      categories,
      festival: query.festival ?? null,
    });

    if (!error && data) {
      return (data as RpcCinemaRow[]).map((row) => ({
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

    if (error) console.warn('[w2w] nearby RPC failed, using mock data:', error.message);
  }

  return mockNearbyCinemas({
    lat: query.coords.lat,
    lng: query.coords.lng,
    movieId: query.movieId,
    radiusMeters: query.radiusMeters,
    from,
    until: end,
    formats,
    categories,
    festival: query.festival,
  });
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
  const client = FORCE_MOCK ? null : getSupabaseClient();

  if (client) {
    const { data, error } = await client.rpc('search_movies_with_showtimes', {
      search_term: term,
      max_results: limit,
    });
    if (!error && data) return data as MovieSearchResult[];
    if (error) console.warn('[w2w] movie search failed, using mock data:', error.message);
  }

  return mockSearchMovies(term, limit) as MovieSearchResult[];
}

export async function listFestivals(): Promise<string[]> {
  const client = FORCE_MOCK ? null : getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from('movies')
      .select('festival_name')
      .not('festival_name', 'is', null);
    if (!error && data) {
      return [...new Set(data.map((r) => r.festival_name as string))].sort();
    }
  }

  return mockFestivals();
}

export async function getMovieById(id: string) {
  const client = FORCE_MOCK ? null : getSupabaseClient();

  if (client) {
    const { data, error } = await client.from('movies').select('*').eq('id', id).single();
    if (!error && data) return data;
  }

  return MOCK_MOVIES.find((m) => m.id === id) ?? null;
}
