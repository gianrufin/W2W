/**
 * Festival ingest worker.
 *
 *   npm run festivals                        # every adapter, then archive
 *   npm run festivals -- --source=qcinema
 *   npm run festivals -- --preview           # fetch, print, write nothing
 *   npm run festivals -- --archive-only      # just run the lifecycle pass
 *
 * Runs on its own schedule, separate from `npm run scrape`. Festival programmes
 * change on the scale of weeks, not hours, and keeping the two apart is what
 * stops a festival site's outage from touching the live chain pipeline.
 */

import 'dotenv/config';
import {
  ALL_FESTIVAL_ADAPTERS,
  runFestivalPipeline,
  archiveFinishedFestivals,
  type FestivalScrapeResult,
} from '../lib/festivals';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const only = arg('source');
  const horizonDays = Number(arg('horizon') ?? 180);
  const preview = process.argv.includes('--preview');

  if (process.argv.includes('--archive-only')) {
    const { reactivated, archived } = await archiveFinishedFestivals();
    console.log(`Lifecycle: ${reactivated} festivals re-flagged, ${archived} screenings archived.`);
    return;
  }

  const adapters = only
    ? ALL_FESTIVAL_ADAPTERS.filter((a) => a.source === only)
    : ALL_FESTIVAL_ADAPTERS;

  if (!adapters.length) {
    throw new Error(
      `Unknown source "${only}". Available: ${ALL_FESTIVAL_ADAPTERS.map((a) => a.source).join(', ')}`,
    );
  }

  console.log(`Running ${adapters.length} festival adapter(s), horizon ${horizonDays} days.`);

  if (preview) {
    await previewRun(adapters, horizonDays);
    return;
  }

  const summaries = await runFestivalPipeline(adapters, { horizonDays });

  for (const s of summaries) {
    console.log(
      `\n${s.source}: ${s.editions} editions, ${s.films} films, ${s.screenings} screenings` +
        (s.skipped ? `, ${s.skipped} skipped` : ''),
    );
    // The alias queue: each of these is one INSERT away from being on the map.
    for (const venue of s.unmappedVenues) {
      console.warn(`  ? unmapped venue "${venue}" — add it to festival_venue_aliases`);
    }
    for (const err of s.errors.slice(0, 8)) console.warn(`  ! ${err}`);
    if (s.errors.length > 8) console.warn(`  … ${s.errors.length - 8} more`);
  }

  const { reactivated, archived } = await archiveFinishedFestivals();
  console.log(`\nLifecycle: ${reactivated} festivals re-flagged, ${archived} screenings archived.`);
}

/** Fetch and report without a database, so an adapter can be checked anywhere. */
async function previewRun(adapters: typeof ALL_FESTIVAL_ADAPTERS, horizonDays: number) {
  for (const adapter of adapters) {
    const started = Date.now();
    let result: FestivalScrapeResult;
    try {
      result = await adapter.fetch({ horizonDays });
    } catch (err) {
      console.error(`\n${adapter.source}: FATAL ${(err as Error).message}`);
      continue;
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `\n${adapter.source}: ${result.editions.length} editions, ` +
        `${result.events.length} screenings  (${seconds}s)`,
    );

    for (const edition of result.editions) {
      console.log(
        `    ${edition.name} — ${edition.screening_start_date ?? '?'} → ` +
          `${edition.screening_end_date ?? '?'} (${edition.cadence})`,
      );
    }
    // A sample beats a count: 240 screenings all at midnight is broken in a way
    // no summary line reveals.
    for (const event of result.events.slice(0, 3)) {
      console.log(
        `    ${event.showtime}  ${(event.section ?? '-').padEnd(18)} ` +
          `${event.venue_name} — ${event.film_title}${event.talkback_flag ? '  [talkback]' : ''}`,
      );
    }
    for (const err of result.errors.slice(0, 4)) console.warn(`  ! ${err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
