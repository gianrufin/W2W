/**
 * Scheduled scraper worker.
 *
 *   npm run scrape                 # all sources, today + 2 days
 *   npm run scrape -- --source=sm-cinema --days=5
 *   npm run scrape -- --dry-run    # venues only, no network
 *   npm run scrape -- --preview    # scrape for real, print, write nothing
 *
 * `--preview` exists because the alternative is finding out a scraper is broken
 * by watching it write zero rows into production. It needs no database
 * credentials, so a change to a selector or an endpoint can be checked from
 * anywhere before it is trusted with the schedule.
 */

import 'dotenv/config';
import { ALL_SCRAPERS, runPipeline, pruneExpiredShowtimes } from '../lib/scrapers';
import type { ScrapeResult } from '../lib/scrapers';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main() {
  const only = arg('source');
  const days = Number(arg('days') ?? 3);
  const dryRun = process.argv.includes('--dry-run');

  const scrapers = only ? ALL_SCRAPERS.filter((s) => s.source === only) : ALL_SCRAPERS;
  if (scrapers.length === 0) {
    throw new Error(
      `Unknown source "${only}". Available: ${ALL_SCRAPERS.map((s) => s.source).join(', ')}`,
    );
  }

  const dates = scrapers[0].defaultDates(days);
  console.log(`Running ${scrapers.length} scraper(s) for ${dates.join(', ')}${dryRun ? ' (dry run)' : ''}`);

  if (process.argv.includes('--preview')) {
    await preview(scrapers, dates, dryRun);
    return;
  }

  const summaries = await runPipeline(scrapers, { dates, dryRun });

  for (const s of summaries) {
    console.log(
      `\n${s.source}: ${s.cinemas} cinemas, ${s.movies} movies, ${s.showtimes} showtimes` +
        (s.enriched ? `, ${s.enriched} enriched` : '') +
        (s.skipped ? `, ${s.skipped} skipped` : ''),
    );
    for (const err of s.errors.slice(0, 10)) console.warn(`  ! ${err}`);
    if (s.errors.length > 10) console.warn(`  … ${s.errors.length - 10} more`);
  }

  const pruned = await pruneExpiredShowtimes();
  console.log(`\nPruned ${pruned} expired showtimes.`);
}

/** Scrape and report, touching no database. */
async function preview(
  scrapers: typeof ALL_SCRAPERS,
  dates: string[],
  dryRun: boolean,
): Promise<void> {
  for (const scraper of scrapers) {
    const started = Date.now();
    let result: ScrapeResult;
    try {
      result = await scraper.scrape({ dates, dryRun });
    } catch (err) {
      console.error(`\n${scraper.source}: FATAL ${(err as Error).message}`);
      continue;
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `\n${scraper.source}: ${result.cinemas.length} cinemas, ` +
        `${result.movies.length} movies, ${result.showtimes.length} showtimes  (${seconds}s)`,
    );

    // A sample beats a count: a scraper that emits 400 showtimes all at
    // midnight is broken in a way no summary line would reveal.
    for (const showtime of result.showtimes.slice(0, 3)) {
      console.log(
        `    ${showtime.start_time}  ${showtime.format.padEnd(14)} ` +
          `${showtime.movie_slug}  @ ${showtime.cinema_slug}`,
      );
    }
    for (const err of result.errors.slice(0, 5)) console.warn(`  ! ${err}`);
    if (result.errors.length > 5) console.warn(`  … ${result.errors.length - 5} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
