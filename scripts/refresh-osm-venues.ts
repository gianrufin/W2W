/**
 * Refresh the OpenStreetMap venue snapshot.
 *
 *   npm run refresh:osm
 *
 * Writes `lib/scrapers/data/osm-venues.json` — every `shop=mall` and
 * `amenity=cinema` feature in the Philippines that carries a name, with the
 * centre of its footprint.
 *
 * ## Why a committed snapshot rather than a live query
 *
 * Overpass is slow (a nationwide query takes tens of seconds), rate-limited,
 * and occasionally down. None of that should be able to move a cinema pin
 * during a routine scrape.
 *
 * More importantly: committing it makes coordinates **reviewable**. When a
 * venue moves, it moves in a diff someone can read, rather than silently
 * between two runs. Given that a wrong pin sends a person to the wrong
 * building, that is worth the manual refresh step.
 *
 * ## Why OSM footprints beat the alternatives
 *
 * The previous best source was ClickTheCity's directory. It placed Robinsons
 * Place General Trias 12.2 km from the actual mall — near an S&R in a
 * different barangay. Nominatim's geocoder did not catch it either, because
 * Nominatim guesses from a text query while these are surveyed building
 * polygons with `shop=mall` on them. The polygon centre is the building.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'lib/scrapers/data/osm-venues.json';

/** Generous bounding box for the whole archipelago. */
const PH_BBOX = '4.2,116.0,21.5,127.0';

/**
 * Overpass mirrors, tried in order.
 *
 * A nationwide query is heavy enough that the main instance returns 504 under
 * load perhaps one run in three. Falling through to a mirror is the difference
 * between "run it again later" and "it worked".
 */
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OsmVenue {
  name: string;
  lat: number;
  lng: number;
  /** 'mall' or 'cinema' — a cinema feature is the more precise of the two. */
  kind: 'mall' | 'cinema';
  city?: string;
}

async function main() {
  const query =
    `[out:json][timeout:180];` +
    `(nwr["shop"="mall"](${PH_BBOX});nwr["amenity"="cinema"](${PH_BBOX}););` +
    `out center tags;`;

  console.log('Querying Overpass for every named mall and cinema in the Philippines…');

  const body = await queryWithFallback(query);

  const venues: OsmVenue[] = [];
  for (const element of body.elements ?? []) {
    const name = element.tags?.name?.trim();
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue;

    venues.push({
      name,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      kind: element.tags?.amenity === 'cinema' ? 'cinema' : 'mall',
      city: element.tags?.['addr:city'] || undefined,
    });
  }

  // Sorted so a refresh produces a readable diff instead of a reshuffle.
  venues.sort((a, b) => a.name.localeCompare(b.name) || a.lat - b.lat);

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(venues, null, 1)}\n`, 'utf8');

  const cinemas = venues.filter((v) => v.kind === 'cinema').length;
  console.log(
    `Wrote ${venues.length} venues to ${OUT} ` +
      `(${venues.length - cinemas} malls, ${cinemas} cinemas)`,
  );
}

/** Try each mirror in turn, twice, before giving up. */
async function queryWithFallback(query: string): Promise<{ elements?: OverpassElement[] }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const endpoint of OVERPASS_MIRRORS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'W2W-venue-snapshot/1.0 (https://github.com/gianrufin/W2W)',
          },
        });
        if (!response.ok) throw new Error(`${new URL(endpoint).host} → ${response.status}`);

        const parsed = (await response.json()) as { elements?: OverpassElement[] };
        // A mirror can answer 200 with a truncated result under load; a
        // nationwide query returning a handful of features is that, not reality.
        if ((parsed.elements?.length ?? 0) < 500) {
          throw new Error(`${new URL(endpoint).host} returned only ${parsed.elements?.length ?? 0} features`);
        }

        console.log(`  via ${new URL(endpoint).host}`);
        return parsed;
      } catch (err) {
        lastError = err as Error;
        console.warn(`  ! ${(err as Error).message}`);
      }
    }
    // Give a loaded instance a moment before coming round again.
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5_000));
  }

  throw lastError ?? new Error('every Overpass mirror failed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
