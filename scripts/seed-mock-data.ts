/**
 * Seed the Supabase project with the mock dataset.
 *
 *   cp .env.example .env.local   # fill in URL + SUPABASE_SERVICE_ROLE_KEY
 *   npm run seed
 *
 * Reuses the same tables and the same upsert path the scrapers use, so a seeded
 * database is indistinguishable from a scraped one as far as the UI is concerned.
 */

import 'dotenv/config';
import { getAdminClient } from '../lib/supabase/admin';
import { MOCK_CINEMAS, MOCK_MOVIES, MOCK_SHOWTIMES } from '../lib/mock-data';

async function main() {
  const client = getAdminClient();

  console.log(`Seeding ${MOCK_CINEMAS.length} cinemas…`);
  const { error: cinemaError } = await client.from('cinemas').upsert(
    MOCK_CINEMAS.map((c) => ({
      name: c.name,
      slug: c.slug,
      chain: c.chain,
      location: `SRID=4326;POINT(${c.lng} ${c.lat})`,
      address: c.address ?? null,
      city: c.city ?? null,
      website_url: c.website_url ?? null,
    })),
    { onConflict: 'slug' },
  );
  if (cinemaError) throw new Error(`cinemas: ${cinemaError.message}`);

  console.log(`Seeding ${MOCK_MOVIES.length} movies…`);
  const { error: movieError } = await client.from('movies').upsert(
    MOCK_MOVIES.map((m) => ({
      title: m.title,
      slug: m.slug,
      normalized_title: m.normalized_title,
      synopsis: m.synopsis ?? null,
      poster_url: m.poster_url ?? null,
      rating: m.rating ?? null,
      duration_mins: m.duration_mins ?? null,
      category: m.category,
      festival_name: m.festival_name ?? null,
      genres: m.genres ?? [],
    })),
    { onConflict: 'slug' },
  );
  if (movieError) throw new Error(`movies: ${movieError.message}`);

  // Mock ids are synthetic strings; resolve the real uuids by slug.
  const { data: cinemaRows } = await client.from('cinemas').select('id, slug');
  const { data: movieRows } = await client.from('movies').select('id, slug');

  const cinemaBySlug = new Map((cinemaRows ?? []).map((r) => [r.slug as string, r.id as string]));
  const movieBySlug = new Map((movieRows ?? []).map((r) => [r.slug as string, r.id as string]));
  const mockCinemaSlug = new Map(MOCK_CINEMAS.map((c) => [c.id, c.slug]));
  const mockMovieSlug = new Map(MOCK_MOVIES.map((m) => [m.id, m.slug]));

  const rows = MOCK_SHOWTIMES.map((s) => {
    const cinemaId = cinemaBySlug.get(mockCinemaSlug.get(s.cinema_id) ?? '');
    const movieId = movieBySlug.get(mockMovieSlug.get(s.movie_id) ?? '');
    if (!cinemaId || !movieId) return null;
    return {
      cinema_id: cinemaId,
      movie_id: movieId,
      screen_name: s.screen_name ?? null,
      format: s.format,
      start_time: s.start_time,
      booking_url: s.booking_url ?? null,
      ticket_price: s.ticket_price ?? null,
      source: 'seed-mock-data',
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`Seeding ${rows.length} showtimes…`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client
      .from('showtimes')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'cinema_id,movie_id,start_time,format' });
    if (error) throw new Error(`showtimes @${i}: ${error.message}`);
    process.stdout.write(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }

  console.log('\nDone. Unset NEXT_PUBLIC_USE_MOCK_DATA to read from Supabase.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
