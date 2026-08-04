/**
 * Location integrity check — every venue the app would actually publish.
 *
 *   npm run verify:locations
 *   npm run verify:locations -- --osm     # also cross-check against OpenStreetMap
 *
 * `audit:venues` checks the hand registry. This checks the *output*: it runs
 * every fetch-only scraper's venue resolution and inspects the coordinates that
 * would be written to the database, which is the only set that matters to
 * someone driving somewhere.
 *
 * It exists because a bug got past the registry audit entirely. `venueKey`
 * strips the operator's branding so a chain's own spellings reconcile, which
 * also made different operators in the same town collide:
 *
 *   venueKey('Vista Mall Tanza') === venueKey('SM City Tanza') === 'tanza'
 *
 * With one flat index, Vista Cinemas Tanza was pinned on top of SM City Tanza
 * and Vista General Trias on top of Robinsons General Trias. Every venue was
 * individually plausible; the error was only visible in the relationships
 * between them. So these checks are relational.
 *
 * Exit code is non-zero when a hard check fails, so this can gate a scrape.
 */

import 'dotenv/config';
import { smCinemaScraper, ayalaCinemaScraper } from '../lib/scrapers/vista-cloud';
import { robinsonsScraper } from '../lib/scrapers/robinsons';
import { megaworldScraper } from '../lib/scrapers/megaworld';
import { vistaCinemaScraper } from '../lib/scrapers/vista-cinema';
import { ticketNetScraper } from '../lib/scrapers/ticketnet';
import { clickTheCityScraper } from '../lib/scrapers/clickthecity';
import { createGeoResolver } from '../lib/scrapers/geo';
import { httpJson, sleep } from '../lib/scrapers/http';
import { haversineKm } from '../lib/utils';
import type { BaseScraper, ScrapedCinema } from '../lib/scrapers/base-scraper';

/** The Philippines, generously bounded. Anything outside is nonsense. */
const PH_BOUNDS = { minLat: 4.2, maxLat: 21.5, minLng: 116.0, maxLng: 127.0 };

/**
 * Two cinemas closer than this are treated as the same building.
 *
 * Genuinely co-located venues exist — Gateway Cineplex 18 and Gateway Mall 2
 * are a few hundred metres apart — so this only *reports*. It is a hard failure
 * solely when the two belong to different operators, which cannot be a real
 * co-location and is the collision signature.
 */
const SAME_BUILDING_M = 60;

interface Venue extends ScrapedCinema {
  source: string;
}

async function main() {
  const withOsm = process.argv.includes('--osm');

  // Only the scrapers that need no browser. SM and Ayala need Playwright for
  // their token, and their coordinates come from the platform itself anyway.
  const scrapers: BaseScraper[] = [
    robinsonsScraper,
    megaworldScraper,
    vistaCinemaScraper,
    ticketNetScraper,
    clickTheCityScraper,
  ];

  console.log(`Resolving venues from ${scrapers.length} sources…\n`);

  const venues: Venue[] = [];
  for (const scraper of scrapers) {
    try {
      // A date nothing screens on: we want the venue resolution, not schedules.
      const result = await scraper.scrape({ dates: ['2099-01-01'] });
      for (const cinema of result.cinemas) venues.push({ ...cinema, source: scraper.source });

      const unplaced = result.errors.filter((e) => e.includes('no coordinates')).length;
      console.log(
        `  ${scraper.source.padEnd(22)} ${String(result.cinemas.length).padStart(3)} placed` +
          (unplaced ? `, ${unplaced} unplaced` : ''),
      );
    } catch (err) {
      console.error(`  ${scraper.source}: FAILED ${(err as Error).message}`);
    }
  }

  console.log(`\n${venues.length} venues resolved.\n`);

  let failures = 0;
  failures += checkBounds(venues);
  failures += checkCrossChainCollisions(venues);
  checkSameChainDuplicates(venues);
  failures += await checkResolverCollisions();
  await checkCityAgreement(venues);

  if (withOsm) await checkAgainstOsm(venues);

  console.log(
    failures === 0
      ? '\n✓ No location-integrity failures.'
      : `\n✗ ${failures} location-integrity failure(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

/** Hard failure: a coordinate outside the country is never right. */
function checkBounds(venues: Venue[]): number {
  const bad = venues.filter(
    (v) =>
      v.lat < PH_BOUNDS.minLat ||
      v.lat > PH_BOUNDS.maxLat ||
      v.lng < PH_BOUNDS.minLng ||
      v.lng > PH_BOUNDS.maxLng,
  );

  console.log(`Bounds — ${bad.length} venue(s) outside the Philippines`);
  for (const v of bad) console.log(`  ✗ ${v.name}  ${v.lat}, ${v.lng}`);
  return bad.length;
}

/**
 * Hard failure: two operators at the same point.
 *
 * This is the exact bug that shipped. SM and Vista do not share a building, so
 * if their pins coincide, one of them borrowed the other's coordinates.
 */
function checkCrossChainCollisions(venues: Venue[]): number {
  const failures: string[] = [];

  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const a = venues[i];
      const b = venues[j];
      if (a.chain === b.chain) continue;
      if (haversineKm(a, b) * 1000 > SAME_BUILDING_M) continue;
      failures.push(
        `  ✗ ${a.name} [${a.chain}] and ${b.name} [${b.chain}] share a point ` +
          `(${a.lat.toFixed(5)}, ${a.lng.toFixed(5)})`,
      );
    }
  }

  console.log(`Cross-chain collisions — ${failures.length}`);
  failures.forEach((f) => console.log(f));
  return failures.length;
}

/** Reported, not failed: one chain can legitimately have two screens in a mall. */
function checkSameChainDuplicates(venues: Venue[]): void {
  const seen = new Map<string, Venue[]>();
  for (const v of venues) {
    const key = `${v.chain}|${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
    seen.set(key, [...(seen.get(key) ?? []), v]);
  }

  const dupes = [...seen.values()].filter((group) => group.length > 1);
  console.log(`Same-chain co-located venues — ${dupes.length} (review, not necessarily wrong)`);
  for (const group of dupes) {
    console.log(`  ? ${group.map((v) => `${v.name} (${v.source})`).join('  |  ')}`);
  }
}

/** The resolver's own view, which covers venues no scraper emitted this run. */
async function checkResolverCollisions(): Promise<number> {
  const geo = await createGeoResolver();
  const collisions = geo.collisions();
  console.log(`Resolver index collisions — ${collisions.length}`);
  for (const c of collisions) console.log(`  ✗ ${c.point}  ${c.venues.join('  |  ')}`);
  return collisions.length;
}

/**
 * Does the coordinate land anywhere near the city on the label?
 *
 * Reported rather than failed: city strings are inconsistent ("Parañaque" vs
 * "Parañaque City" vs "Metro Manila"), and geocoding every one of them to check
 * would just move the uncertainty. This catches the gross cases.
 */
async function checkCityAgreement(venues: Venue[]): Promise<void> {
  const byCity = new Map<string, Venue[]>();
  for (const v of venues) {
    if (!v.city) continue;
    byCity.set(v.city, [...(byCity.get(v.city) ?? []), v]);
  }

  const scattered: string[] = [];
  for (const [city, group] of byCity) {
    if (group.length < 2) continue;
    // Venues in one city should cluster. A member far from the group's centre
    // is either mislabelled or misplaced.
    const centre = {
      lat: group.reduce((n, v) => n + v.lat, 0) / group.length,
      lng: group.reduce((n, v) => n + v.lng, 0) / group.length,
    };
    for (const v of group) {
      const km = haversineKm(v, centre);
      if (km > 40) {
        scattered.push(`  ? ${v.name} is ${km.toFixed(0)} km from the centre of "${city}"`);
      }
    }
  }

  console.log(`City agreement — ${scattered.length} venue(s) far from their city's cluster`);
  scattered.forEach((s) => console.log(s));
}

/** Third-party corroboration, rate-limited per Nominatim's usage policy. */
async function checkAgainstOsm(venues: Venue[]): Promise<void> {
  console.log(`\nOSM cross-check of ${venues.length} venues (~${Math.ceil(venues.length * 1.1 / 60)} min)…`);

  const disagreements: string[] = [];
  let checked = 0;

  for (const venue of venues) {
    await sleep(1_100);
    try {
      const hits = await httpJson<Array<{ lat: string; lon: string; display_name: string }>>(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=' +
          encodeURIComponent(`${venue.name}, ${venue.city ?? ''}, Philippines`),
        {
          headers: { 'user-agent': 'W2W-location-verify/1.0 (https://github.com/gianrufin/W2W)' },
          retries: 1,
        },
      );
      if (!hits.length) continue;
      checked += 1;

      const km = haversineKm(venue, { lat: Number(hits[0].lat), lng: Number(hits[0].lon) });
      // Only flag matches where OSM found something with a shared distinctive
      // word — otherwise it is a different place and tells us nothing.
      if (km > 1 && sharesWord(venue.name, hits[0].display_name.split(',')[0])) {
        disagreements.push(
          `  ? ${venue.name} — OSM puts "${hits[0].display_name.split(',')[0]}" ${km.toFixed(1)} km away`,
        );
      }
    } catch {
      // Nominatim being unavailable is not a location problem.
    }
    process.stdout.write(`\r  ${checked} corroborated`);
  }

  console.log(`\nOSM — ${disagreements.length} disagreement(s) over 1 km`);
  disagreements.forEach((d) => console.log(d));
}

function sharesWord(a: string, b: string): boolean {
  const stop = new Set([
    'the', 'cinema', 'cinemas', 'mall', 'malls', 'place', 'city', 'center', 'centre',
    'cineplex', 'robinsons', 'ayala', 'vista', 'megaworld', 'fdcp', 'movieworld',
    'starmall', 'lifestyle', 'premier', 'society',
  ]);
  const words = (t: string) =>
    new Set(
      t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)),
    );

  const wanted = words(a);
  const got = words(b);
  for (const w of wanted) if (got.has(w)) return true;
  return false;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
