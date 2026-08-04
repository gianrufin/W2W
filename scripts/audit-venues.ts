/**
 * Venue coordinate audit.
 *
 *   npm run audit:venues              # every venue, against OpenStreetMap
 *   npm run audit:venues -- --threshold=300
 *   npm run audit:venues -- --registry-only
 *
 * Why this exists: the app sorts cinemas by distance and is about to tell people
 * when to leave home. Both are worthless if a pin is in the wrong place, and a
 * wrong pin is invisible — the map looks fine, the number is confident, and the
 * user drives somewhere there is no cinema.
 *
 * We have two internal sources (the hand registry and the ClickTheCity
 * directory) and they mostly agree, but agreement between two sources that were
 * never independently checked is not evidence. This adds a third opinion from
 * OpenStreetMap and reports where they diverge.
 *
 * What this is NOT: proof. Nominatim can be wrong, can return a mall's postal
 * centroid rather than its cinema entrance, or can match the wrong branch of a
 * chain entirely. Every disagreement is printed for a human to arbitrate; the
 * script changes nothing on its own. A venue confirmed by eye gets
 * `verified: true` in venues.ts, and only then does it outrank the directory.
 */

import 'dotenv/config';
import { fetchTheaterDirectory } from '../lib/scrapers/clickthecity';
import { ALL_VENUES } from '../lib/scrapers/venues';
import { venueKey } from '../lib/scrapers/geo';
import { httpJson, sleep } from '../lib/scrapers/http';
import { haversineKm } from '../lib/utils';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Nominatim's usage policy caps automated use at one request per second and
 * requires an identifying User-Agent. A full run is therefore ~3 minutes, which
 * is why this is a manual audit rather than part of every scrape.
 */
const RATE_LIMIT_MS = 1_100;
const UA = 'W2W-venue-audit/1.0 (https://github.com/gianrufin/W2W)';

interface Candidate {
  name: string;
  city: string;
  lat: number;
  lng: number;
  source: 'registry' | 'directory';
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
}

/**
 * Did OSM find the venue we asked about, or something else nearby?
 *
 * This distinction is the difference between a useful report and a noisy one.
 * The first run flagged "Robinsons Santiago" as 1006 km out — OSM had matched a
 * barangay called Santiago in Pagadian, 1000 km from Santiago City, Isabela.
 * Meanwhile "Glorietta 4 Cinemas" was flagged at 310 m and OSM had found the
 * literal cinema, which was the more accurate point.
 *
 * Both are "disagreements". Only one is ours to fix. The first component of
 * `display_name` is the thing OSM actually matched, so comparing that against
 * the venue's distinctive words separates them.
 */
function matchQuality(venueName: string, hit: NominatimHit): 'named' | 'nearby' {
  const matched = hit.display_name.split(',')[0];
  const words = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        // Operator and building words are shared by half the country's malls,
        // so they carry no evidence about whether this is the right branch.
        .filter(
          (w) =>
            w.length > 2 &&
            !['the', 'cinema', 'cinemas', 'mall', 'malls', 'place', 'city', 'center', 'centre',
              'cineplex', 'robinsons', 'ayala', 'vista', 'megaworld', 'fdcp',
              // Operator sub-brands. "Robinsons Movieworld Manila" matched
              // "Robinsons Movieworld, Cubao" on this word alone — the wrong
              // branch, 7 km away, scored as a confident hit.
              'movieworld', 'starmall', 'lifestyle', 'premier', 'society'].includes(w),
        ),
    );

  const wanted = words(venueName);
  const got = words(matched);
  if (!wanted.size) return 'nearby';

  for (const word of wanted) if (got.has(word)) return 'named';
  return 'nearby';
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  // Metres. 300 is about a city block — tighter than that and every mall
  // centroid vs entrance difference becomes noise.
  const thresholdM = Number(arg('threshold') ?? 300);
  const registryOnly = process.argv.includes('--registry-only');

  const candidates: Candidate[] = ALL_VENUES.map((v) => ({
    name: v.name,
    city: v.city,
    lat: v.lat,
    lng: v.lng,
    source: 'registry' as const,
  }));

  if (!registryOnly) {
    const directory = await fetchTheaterDirectory();
    // Skip directory venues the registry already covers — auditing the same
    // place twice doubles the runtime and tells us nothing new.
    const known = new Set(candidates.map((c) => venueKey(c.name)));
    for (const v of directory) {
      if (known.has(venueKey(v.name))) continue;
      candidates.push({
        name: v.name,
        city: v.city ?? '',
        lat: v.lat,
        lng: v.lng,
        source: 'directory',
      });
    }
  }

  console.log(
    `Auditing ${candidates.length} venues against OpenStreetMap ` +
      `(threshold ${thresholdM} m, ~${Math.ceil((candidates.length * RATE_LIMIT_MS) / 60_000)} min)\n`,
  );

  const disagreements: Array<
    Candidate & { osmKm: number; osm: NominatimHit; quality: 'named' | 'nearby' }
  > = [];
  const notFound: Candidate[] = [];

  for (const [index, venue] of candidates.entries()) {
    if (index > 0) await sleep(RATE_LIMIT_MS);

    let hit: NominatimHit | null;
    try {
      hit = await lookup(venue);
    } catch (err) {
      console.warn(`  ! ${venue.name}: ${(err as Error).message}`);
      continue;
    }

    if (!hit) {
      notFound.push(venue);
      continue;
    }

    const km = haversineKm(venue, { lat: Number(hit.lat), lng: Number(hit.lon) });
    if (km * 1000 > thresholdM) {
      disagreements.push({ ...venue, osmKm: km, osm: hit, quality: matchQuality(venue.name, hit) });
    }

    process.stdout.write(`\r  ${index + 1}/${candidates.length}`);
  }

  console.log('\n');
  report(candidates.length, disagreements, notFound, thresholdM);
}

/**
 * Ask OpenStreetMap where this venue is.
 *
 * Two passes: the full name with its city, then the name alone. Philippine mall
 * names are distinctive enough that the second rarely mismatches, and the city
 * constraint is what stops "SM City Cebu" resolving to a branch in Manila.
 */
async function lookup(venue: Candidate): Promise<NominatimHit | null> {
  const queries = [
    `${venue.name}, ${venue.city}, Philippines`,
    `${venue.name}, Philippines`,
  ];

  for (const query of queries) {
    const url =
      `${NOMINATIM}?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`;
    const hits = await httpJson<NominatimHit[]>(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      retries: 1,
    });
    if (hits.length) return hits[0];
    await sleep(RATE_LIMIT_MS);
  }

  return null;
}

function report(
  total: number,
  disagreements: Array<Candidate & { osmKm: number; osm: NominatimHit; quality: string }>,
  notFound: Candidate[],
  thresholdM: number,
): void {
  // Only the ones where OSM found the venue we asked about are evidence.
  const real = disagreements.filter((d) => d.quality === 'named').sort((a, b) => b.osmKm - a.osmKm);
  const noise = disagreements.filter((d) => d.quality !== 'named');

  console.log(`Checked ${total} venues.`);
  console.log(`  ${real.length} likely wrong — OSM found this venue by name, somewhere else`);
  console.log(`  ${noise.length} inconclusive — OSM matched a different place, ignore`);
  console.log(`  ${notFound.length} not in OSM (not an error — many malls are unmapped)\n`);

  if (real.length) {
    console.log('Needs a human to arbitrate, furthest first:\n');
    for (const d of real) {
      console.log(`  ${d.osmKm.toFixed(2)} km  ${d.name}  [${d.source}]`);
      console.log(`            ours: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`);
      console.log(`            osm:  ${Number(d.osm.lat).toFixed(5)}, ${Number(d.osm.lon).toFixed(5)}`);
      console.log(`            osm says: ${d.osm.display_name.slice(0, 90)}`);
      // The link is the point: this is meant to be opened and looked at.
      console.log(
        `            check: https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=17/${d.lat}/${d.lng}\n`,
      );
    }
    console.log(
      'For each: open the link, decide which point is right, and if ours is\n' +
        'correct add `verified: true` to its entry in lib/scrapers/venues.ts so\n' +
        'it stops being flagged and starts outranking the directory.\n',
    );
  }

  if (noise.length) {
    console.log('Inconclusive — OSM matched something else entirely:\n');
    for (const d of noise) {
      console.log(
        `  ${d.name}  →  OSM returned "${d.osm.display_name.split(',')[0]}" ` +
          `(${d.osmKm.toFixed(0)} km away)`,
      );
    }
    console.log();
  }

  if (notFound.length) {
    console.log(`Not in OSM: ${notFound.map((v) => v.name).join(', ')}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
