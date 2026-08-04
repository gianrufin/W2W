import type { ScrapedMovie } from './base-scraper';

/**
 * TMDB enrichment.
 *
 * Cinema chains publish artwork inconsistently — SM often has none, indie
 * venues almost never do. When TMDB_API_KEY is set we look up whatever came
 * back without a poster and fill in art, synopsis and runtime.
 *
 * Deliberately best-effort: enrichment never fails a scrape. A film with no
 * poster still belongs on the map.
 */

const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

interface TmdbSearchResponse {
  results?: Array<{
    id: number;
    title?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
  }>;
}

interface TmdbDetails {
  runtime?: number | null;
}

export interface EnrichOptions {
  apiKey?: string;
  /** Cap the lookups per run so a large scrape cannot exhaust the rate limit. */
  max?: number;
  /** Milliseconds between requests — TMDB tolerates ~50/s, we stay far under. */
  delayMs?: number;
}

export async function enrichMovies(
  movies: ScrapedMovie[],
  options: EnrichOptions = {},
): Promise<{ enriched: number; errors: string[] }> {
  const apiKey = options.apiKey ?? process.env.TMDB_API_KEY;
  const errors: string[] = [];
  if (!apiKey) return { enriched: 0, errors: ['TMDB_API_KEY not set — skipping enrichment'] };

  const max = options.max ?? 60;
  const delayMs = options.delayMs ?? 120;

  // Festival and indie titles are mostly local premieres TMDB will not have;
  // spending the budget on them starves the mainstream titles that do benefit.
  const targets = movies
    .filter((m) => !m.poster_url)
    .sort((a, b) => Number(a.category !== 'Mainstream') - Number(b.category !== 'Mainstream'))
    .slice(0, max);

  let enriched = 0;

  for (const movie of targets) {
    try {
      const hit = await search(movie.title, apiKey);
      if (!hit) continue;

      if (hit.poster_path) movie.poster_url = `${IMAGE_BASE}${hit.poster_path}`;
      if (!movie.synopsis && hit.overview) movie.synopsis = hit.overview;

      if (!movie.duration_mins) {
        const runtime = await details(hit.id, apiKey);
        if (runtime) movie.duration_mins = runtime;
      }

      enriched += 1;
    } catch (err) {
      errors.push(`tmdb "${movie.title}": ${(err as Error).message}`);
    }
    await sleep(delayMs);
  }

  return { enriched, errors };
}

async function search(title: string, apiKey: string) {
  const url = authUrl(
    `${BASE}/search/movie?query=${encodeURIComponent(title)}&include_adult=false&language=en-US`,
    apiKey,
  );
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as TmdbSearchResponse;
  return body.results?.[0] ?? null;
}

async function details(id: number, apiKey: string): Promise<number | null> {
  const res = await fetch(authUrl(`${BASE}/movie/${id}?language=en-US`, apiKey), {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as TmdbDetails;
  return body.runtime ?? null;
}

/**
 * TMDB accepts either a v3 key as an `api_key` query param or a v4 token as a
 * bearer header. v4 tokens are long JWTs, so length discriminates reliably.
 */
function isV4Token(apiKey: string): boolean {
  return apiKey.length > 40;
}

function authUrl(url: string, apiKey: string): string {
  return isV4Token(apiKey) ? url : `${url}&api_key=${encodeURIComponent(apiKey)}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return isV4Token(apiKey)
    ? { Authorization: `Bearer ${apiKey}`, accept: 'application/json' }
    : { accept: 'application/json' };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
