import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import type { BaseScraper, ScrapeResult, ScrapeOptions } from './base-scraper';
import { enrichMovies } from './tmdb';

export interface IngestSummary {
  source: string;
  cinemas: number;
  movies: number;
  showtimes: number;
  skipped: number;
  /** Titles that gained a poster/synopsis from TMDB this run. */
  enriched: number;
  errors: string[];
}

/**
 * Ingestion pipeline.
 *
 * Cinemas and movies are upserted on their slug, so a re-scrape refreshes
 * metadata in place. Showtimes are upserted on
 * (cinema_id, movie_id, start_time, format) — the unique constraint from the
 * migration — which makes the whole run idempotent: scraping the same day twice
 * updates prices and booking links instead of doubling the schedule.
 */

const CHUNK = 500;

export async function ingestScrapeResult(
  result: ScrapeResult,
  client: SupabaseClient = getAdminClient(),
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    source: result.source,
    cinemas: 0,
    movies: 0,
    showtimes: 0,
    skipped: 0,
    enriched: 0,
    errors: [...result.errors],
  };

  // ---- cinemas -------------------------------------------------------------
  if (result.cinemas.length) {
    const rows = result.cinemas.map((c) => ({
      name: c.name,
      slug: c.slug,
      chain: c.chain,
      // PostGIS accepts EWKT on a geography column, which keeps us from needing
      // a separate RPC just to write a point.
      location: `SRID=4326;POINT(${c.lng} ${c.lat})`,
      address: c.address ?? null,
      city: c.city ?? null,
      website_url: c.website_url ?? null,
      logo_url: c.logo_url ?? null,
    }));

    const { error } = await client.from('cinemas').upsert(rows, { onConflict: 'slug' });
    if (error) summary.errors.push(`cinemas upsert: ${error.message}`);
    else summary.cinemas = rows.length;
  }

  // ---- movies --------------------------------------------------------------
  if (result.movies.length) {
    // Fill in artwork before the upsert so posters land in the same write.
    const enrichment = await enrichMovies(result.movies);
    summary.enriched = enrichment.enriched;
    summary.errors.push(...enrichment.errors);

    const rows = result.movies.map((m) => ({
      title: m.title,
      slug: m.slug,
      normalized_title: m.normalized_title,
      synopsis: m.synopsis ?? null,
      poster_url: m.poster_url ?? null,
      rating: m.rating ?? null,
      duration_mins: m.duration_mins ?? null,
      category: m.category,
      festival_name: m.festival_name ?? null,
    }));

    const { error } = await client.from('movies').upsert(rows, { onConflict: 'slug' });
    if (error) summary.errors.push(`movies upsert: ${error.message}`);
    else summary.movies = rows.length;
  }

  // ---- showtimes -----------------------------------------------------------
  if (result.showtimes.length) {
    const cinemaIds = await slugToId(client, 'cinemas', result.showtimes.map((s) => s.cinema_slug));
    const movieIds = await slugToId(client, 'movies', result.showtimes.map((s) => s.movie_slug));

    const rows = [];
    for (const s of result.showtimes) {
      const cinemaId = cinemaIds.get(s.cinema_slug);
      const movieId = movieIds.get(s.movie_slug);
      if (!cinemaId || !movieId) {
        // A showtime whose venue or film failed to upsert would violate the FK;
        // drop it and report the count rather than failing the whole batch.
        summary.skipped += 1;
        continue;
      }
      rows.push({
        cinema_id: cinemaId,
        movie_id: movieId,
        screen_name: s.screen_name ?? null,
        format: s.format,
        start_time: s.start_time,
        booking_url: s.booking_url ?? null,
        ticket_price: s.ticket_price ?? null,
        source: result.source,
      });
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await client.from('showtimes').upsert(chunk, {
        onConflict: 'cinema_id,movie_id,start_time,format',
        ignoreDuplicates: false,
      });
      if (error) summary.errors.push(`showtimes upsert @${i}: ${error.message}`);
      else summary.showtimes += chunk.length;
    }
  }

  return summary;
}

async function slugToId(
  client: SupabaseClient,
  table: 'cinemas' | 'movies',
  slugs: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(slugs)];
  const map = new Map<string, string>();

  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await client
      .from(table)
      .select('id, slug')
      .in('slug', unique.slice(i, i + CHUNK));
    if (error) throw new Error(`${table} lookup: ${error.message}`);
    for (const row of data ?? []) map.set(row.slug as string, row.id as string);
  }

  return map;
}

/** Run a set of scrapers and ingest each result. One bad scraper does not stop the rest. */
export async function runPipeline(
  scrapers: BaseScraper[],
  options: ScrapeOptions = {},
): Promise<IngestSummary[]> {
  const client = getAdminClient();
  const summaries: IngestSummary[] = [];

  for (const scraper of scrapers) {
    try {
      const result = await scraper.scrape(options);
      summaries.push(await ingestScrapeResult(result, client));
    } catch (err) {
      summaries.push({
        source: scraper.source,
        cinemas: 0,
        movies: 0,
        showtimes: 0,
        skipped: 0,
        enriched: 0,
        errors: [`fatal: ${(err as Error).message}`],
      });
    }
  }

  return summaries;
}

/** Delete screenings that have already started — keeps the map honest. */
export async function pruneExpiredShowtimes(
  client: SupabaseClient = getAdminClient(),
): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await client
    .from('showtimes')
    .delete()
    .lt('start_time', cutoff)
    .select('id');
  if (error) throw new Error(`prune: ${error.message}`);
  return data?.length ?? 0;
}
