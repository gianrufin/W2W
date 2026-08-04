/**
 * Scheduled scraper worker.
 *
 *   npm run scrape                 # all sources, today + 2 days
 *   npm run scrape -- --source=sm-cinema --days=5
 *   npm run scrape -- --dry-run    # venues only, no network
 */

import 'dotenv/config';
import { ALL_SCRAPERS, runPipeline, pruneExpiredShowtimes } from '../lib/scrapers';

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
