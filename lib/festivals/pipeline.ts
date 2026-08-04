import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { FestivalVenueMap } from './venue-map';
import type { FestivalAdapter } from './adapter';
import type {
  FestivalEdition,
  FestivalEvent,
  FestivalScrapeOptions,
  FestivalScrapeResult,
} from './types';

/**
 * Festival ingest.
 *
 * A separate service from `lib/scrapers/pipeline.ts`, running on its own
 * schedule, and the separation is deliberate rather than incidental. The chain
 * pipeline is live; a festival adapter breaking must not be able to take SM's
 * schedule down with it, and festival ingest must never touch a row a chain
 * scraper owns. Every write here is scoped by `festival_id`.
 *
 * The two meet only in the database, through the additive columns from
 * `004_festivals.sql`. That is what lets one map show both without the app
 * needing to know there were two pipelines behind it.
 *
 * Order matters:
 *   1. editions   — screenings need a festival_id to hang off
 *   2. lifecycle  — is_active recomputed from the freshly written windows
 *   3. films      — one movie row per (festival, title)
 *   4. screenings — resolved to real venues, or dropped and reported
 */

const CHUNK = 500;

export interface FestivalIngestSummary {
  source: string;
  editions: number;
  films: number;
  screenings: number;
  /** Events dropped because their venue could not be resolved. */
  skipped: number;
  /** The queue of aliases to add — see venue-map.ts. */
  unmappedVenues: string[];
  errors: string[];
}

export async function ingestFestivalResult(
  result: FestivalScrapeResult,
  client: SupabaseClient = getAdminClient(),
  venues?: FestivalVenueMap,
): Promise<FestivalIngestSummary> {
  const summary: FestivalIngestSummary = {
    source: result.source,
    editions: 0,
    films: 0,
    screenings: 0,
    skipped: 0,
    unmappedVenues: [],
    errors: [...result.errors],
  };

  // ---- editions ------------------------------------------------------------
  const festivalIds = new Map<string, string>();

  if (result.editions.length) {
    // Two adapters can describe the same edition — CCP knows Cinemalaya's dates,
    // TicketNet knows its screenings. Merge before writing, because Postgres
    // rejects a batch with duplicate conflict keys.
    const merged = new Map<string, (typeof result.editions)[number]>();
    for (const edition of result.editions) {
      const key = `${edition.slug}|${edition.edition_year}`;
      const existing = merged.get(key);
      merged.set(key, existing ? mergeEditions(existing, edition) : edition);
    }

    const rows = [...merged.values()].map((e) => ({
      slug: e.slug,
      name: e.name,
      edition_year: e.edition_year,
      cadence: e.cadence,
      screening_start_date: e.screening_start_date ?? null,
      screening_end_date: e.screening_end_date ?? null,
      official_url: e.official_url ?? null,
      ticket_url: e.ticket_url ?? null,
      source: result.source,
      last_seen_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('festivals')
      .upsert(rows, { onConflict: 'slug,edition_year' });
    if (error) {
      summary.errors.push(`festivals upsert: ${error.message}`);
      // Without festival ids there is nothing to attach screenings to.
      return summary;
    }
    summary.editions = rows.length;
  }

  // Look up ids for every edition this result references, whether or not this
  // adapter wrote it — TicketNet emits Cinemalaya screenings for an edition CCP
  // may have created.
  const referenced = new Set<string>([
    ...result.editions.map((e) => `${e.slug}|${e.edition_year}`),
    ...result.events.map((e) => `${e.festival_slug}|${e.edition_year}`),
  ]);

  for (const key of referenced) {
    const [slug, year] = key.split('|');
    const { data, error } = await client
      .from('festivals')
      .select('id')
      .eq('slug', slug)
      .eq('edition_year', Number(year))
      .maybeSingle();
    if (error) {
      summary.errors.push(`festival lookup ${key}: ${error.message}`);
      continue;
    }
    if (data?.id) festivalIds.set(key, data.id as string);
  }

  // ---- lifecycle -----------------------------------------------------------
  // Derived from the windows just written, so a festival cannot get stuck live
  // because the run meant to close it never happened.
  const { error: lifecycleError } = await client.rpc('refresh_festival_activity');
  if (lifecycleError) summary.errors.push(`lifecycle: ${lifecycleError.message}`);

  if (!result.events.length) return summary;

  // ---- venues --------------------------------------------------------------
  const venueMap = venues ?? (await FestivalVenueMap.load(client));

  // ---- films ---------------------------------------------------------------
  // One movie row per (festival, title): the same title in two editions is two
  // programme entries, and conflating them would merge their screenings.
  const filmSlugs = new Map<string, string>();
  const filmRows: Array<Record<string, unknown>> = [];

  for (const event of result.events) {
    const key = `${event.festival_slug}|${event.edition_year}|${event.film_title}`;
    if (filmSlugs.has(key)) continue;

    const slug = slugifyFilm(event);
    filmSlugs.set(key, slug);
    filmRows.push({
      title: event.film_title,
      slug,
      normalized_title: normalizeTitle(event.film_title),
      synopsis: event.synopsis ?? null,
      poster_url: event.poster_url ?? null,
      rating: event.rating ?? null,
      duration_mins: event.duration_mins ?? null,
      category: 'Festival',
      festival_name: null,
      festival_id: festivalIds.get(`${event.festival_slug}|${event.edition_year}`) ?? null,
      director: event.director ?? null,
      section: event.section ?? null,
      country: event.country ?? null,
      year_produced: event.year_produced ?? null,
    });
  }

  // `festival_name` is the app's display label and drives the Festival Focus
  // rail; fill it from the edition we just resolved.
  const nameByFestivalId = new Map<string, string>();
  for (const edition of result.editions) {
    const id = festivalIds.get(`${edition.slug}|${edition.edition_year}`);
    if (id) nameByFestivalId.set(id, edition.name);
  }
  for (const row of filmRows) {
    const id = row.festival_id as string | null;
    if (id && nameByFestivalId.has(id)) row.festival_name = nameByFestivalId.get(id);
  }

  for (let i = 0; i < filmRows.length; i += CHUNK) {
    const { error } = await client
      .from('movies')
      .upsert(filmRows.slice(i, i + CHUNK), { onConflict: 'slug' });
    if (error) summary.errors.push(`festival films upsert @${i}: ${error.message}`);
    else summary.films += Math.min(CHUNK, filmRows.length - i);
  }

  // ---- screenings ----------------------------------------------------------
  const movieIds = await slugToId(
    client,
    'movies',
    [...new Set(filmSlugs.values())],
    summary,
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const event of result.events) {
    const key = `${event.festival_slug}|${event.edition_year}|${event.film_title}`;
    const movieId = movieIds.get(filmSlugs.get(key) ?? '');
    const festivalId = festivalIds.get(`${event.festival_slug}|${event.edition_year}`);

    const venue = venueMap.resolve(event.venue_name);
    if (!movieId || !festivalId || !venue) {
      // A screening we cannot place is dropped, not guessed at. The venue name
      // survives in `unmappedVenues` so the fix is one INSERT away.
      summary.skipped += 1;
      continue;
    }

    rows.push({
      cinema_id: venue.cinemaId,
      movie_id: movieId,
      festival_id: festivalId,
      screen_name: event.screen_name ?? venue.screenName ?? null,
      format: event.format ?? '2D',
      start_time: event.showtime,
      booking_url: event.ticket_url ?? null,
      ticket_portal: event.ticket_portal ?? null,
      talkback: event.talkback_flag ?? false,
      is_online_screening: event.is_online_screening ?? false,
      admission: event.admission ?? null,
      source: result.source,
    });
  }

  // Same constraint as the chain pipeline: Postgres rejects a batch holding two
  // rows with the same conflict key, and a festival legitimately produces them
  // (one film, one screen, one time, listed under two strands).
  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    deduped.set(`${row.cinema_id}|${row.movie_id}|${row.start_time}|${row.format}`, row);
  }
  const unique = [...deduped.values()];
  summary.skipped += rows.length - unique.length;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { error } = await client.from('showtimes').upsert(chunk, {
      onConflict: 'cinema_id,movie_id,start_time,format',
      ignoreDuplicates: false,
    });
    if (error) summary.errors.push(`festival showtimes upsert @${i}: ${error.message}`);
    else summary.screenings += chunk.length;
  }

  summary.unmappedVenues = [...venueMap.unmapped];
  return summary;
}

/**
 * Run every adapter and ingest each result.
 *
 * One bad adapter never stops the rest — a festival site going down mid-season
 * is the normal case, not an exception worth aborting a run for.
 */
export async function runFestivalPipeline(
  adapters: FestivalAdapter[],
  options: FestivalScrapeOptions = {},
): Promise<FestivalIngestSummary[]> {
  const client = getAdminClient();
  // Loaded once and shared: every adapter needs it and it is two queries.
  const venues = await FestivalVenueMap.load(client);
  const summaries: FestivalIngestSummary[] = [];

  for (const adapter of adapters) {
    try {
      const result = await adapter.fetch(options);
      summaries.push(await ingestFestivalResult(result, client, venues));
    } catch (err) {
      summaries.push({
        source: adapter.source,
        editions: 0,
        films: 0,
        screenings: 0,
        skipped: 0,
        unmappedVenues: [],
        errors: [`fatal: ${(err as Error).message}`],
      });
    }
  }

  return summaries;
}

/**
 * Seasonal cleanup.
 *
 * Recomputes every edition's active flag, then deletes the screenings of
 * editions that finished more than `graceDays` ago. The festival and its films
 * survive: what played at Cinemalaya 22 stays answerable, while when it played
 * stops cluttering a map of tonight.
 *
 * Chain showtimes are untouched — the SQL filters on `festival_id`.
 */
export async function archiveFinishedFestivals(
  graceDays = 2,
  client: SupabaseClient = getAdminClient(),
): Promise<{ reactivated: number; archived: number }> {
  const { data: flipped, error: flipError } = await client.rpc('refresh_festival_activity');
  if (flipError) throw new Error(`refresh_festival_activity: ${flipError.message}`);

  const { data: removed, error: archiveError } = await client.rpc(
    'archive_past_festival_screenings',
    { grace_days: graceDays },
  );
  if (archiveError) throw new Error(`archive_past_festival_screenings: ${archiveError.message}`);

  return { reactivated: Number(flipped ?? 0), archived: Number(removed ?? 0) };
}

// ---- helpers ---------------------------------------------------------------

/**
 * Prefer a real value over a null when two adapters describe one edition.
 *
 * CCP publishes Cinemalaya's dates and nothing else; TicketNet publishes its
 * screenings and infers a narrower window from them. Neither is wrong, and
 * whichever ran second should not blank what the first knew.
 */
function mergeEditions(a: FestivalEdition, b: FestivalEdition): FestivalEdition {
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value !== null && value !== undefined && value !== '') merged[key] = value;
  }
  return merged as unknown as FestivalEdition;
}

function slugifyFilm(event: FestivalEvent): string {
  const base = `${event.festival_slug}-${event.edition_year}-${event.film_title}`;
  return base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/** Same comparison key the chain scrapers use, so search reconciles the two. */
function normalizeTitle(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]/g, '');
}

async function slugToId(
  client: SupabaseClient,
  table: 'movies',
  slugs: string[],
  summary: FestivalIngestSummary,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < slugs.length; i += CHUNK) {
    const { data, error } = await client
      .from(table)
      .select('id, slug')
      .in('slug', slugs.slice(i, i + CHUNK));
    if (error) {
      summary.errors.push(`${table} lookup: ${error.message}`);
      continue;
    }
    for (const row of data ?? []) map.set(row.slug as string, row.id as string);
  }

  return map;
}
