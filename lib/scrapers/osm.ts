import type { CinemaChain } from '@/types';
import snapshot from './data/osm-venues.json';
import { venueKey } from './venue-key';

/**
 * OpenStreetMap venue snapshot — the most accurate coordinate source we have.
 *
 * These are surveyed building footprints tagged `shop=mall` or
 * `amenity=cinema`, and the point is the centre of the polygon. That is a
 * materially different thing from a geocoder's guess at a text query, and the
 * difference is not academic: ClickTheCity's directory placed Robinsons Place
 * General Trias 12.2 km from the mall, and Nominatim's geocoder did not catch
 * it because it is the same *kind* of guess.
 *
 * Refresh with `npm run refresh:osm`. The snapshot is committed so a coordinate
 * change shows up in a diff rather than appearing between two scrape runs.
 *
 * Coverage is also better: 1,290-odd venues including the ~100 Gaisano malls no
 * commercial directory lists at all.
 */

export interface OsmVenue {
  name: string;
  lat: number;
  lng: number;
  kind: 'mall' | 'cinema';
  city?: string;
}

/**
 * Which operator an OSM name belongs to.
 *
 * OSM names the *mall*, not the cinema inside it — "Robinsons Place Imus", not
 * "Robinsons Movieworld Imus" — so the operator has to be read off the name.
 * Longest and most specific patterns first: "SM Cinema" must not be caught by a
 * bare /SM/ rule intended for "SM City".
 */
const CHAIN_PATTERNS: ReadonlyArray<{ pattern: RegExp; chain: CinemaChain }> = [
  { pattern: /\brobinson'?s\b/i, chain: 'Robinsons' },
  { pattern: /\bsm\s+(city|mall|center|centre|supercenter|megamall|aura|seaside|north|south)\b|\bsm\s+[a-z]/i, chain: 'SM' },
  { pattern: /\bmegamall\b/i, chain: 'SM' },
  { pattern: /\b(vista\s*mall|starmall|evia|somo|nomo)\b/i, chain: 'Vista' },
  { pattern: /\b(ayala|glorietta|greenbelt|trinoma|market!\s*market!|alabang town center|cloverleaf|fairview terraces|feliz|circuit|capitol central|centrio|abreeza|solenad|marquee|harbor point|the 30th|vertis)\b/i, chain: 'Ayala' },
  { pattern: /\b(uptown|venice|eastwood|lucky chinatown|festive walk|newport|forbes town|mckinley)\b/i, chain: 'Megaworld' },
  { pattern: /\bgateway\b/i, chain: 'Araneta' },
  { pattern: /\bshangri-?la\b/i, chain: 'ShangriLa' },
  { pattern: /\bfisher\b/i, chain: 'Fisher' },
];

interface OsmCandidate extends OsmVenue {
  chain: CinemaChain | null;
  key: string;
}

export interface OsmMatch extends OsmCandidate {
  /**
   * True when the names matched outright rather than by containment.
   *
   * This distinction decides whether OSM is allowed to *move* a venue or only
   * to *refine* it. "Robinsons Place Tacloban" and "Robinsons North Tacloban"
   * are two different malls 4 km apart, and one key contains the other — so a
   * containment match is not, on its own, evidence that these are the same
   * building.
   */
  exact: boolean;
}

let indexed: OsmCandidate[] | null = null;

/** The snapshot, with each entry's operator and comparison key resolved. */
export function osmVenues(): OsmCandidate[] {
  if (indexed) return indexed;

  indexed = (snapshot as OsmVenue[]).map((venue) => ({
    ...venue,
    chain: CHAIN_PATTERNS.find((c) => c.pattern.test(venue.name))?.chain ?? null,
    key: venueKey(venue.name),
  }));

  return indexed;
}

/**
 * How far a containment match may sit from a coordinate we already have.
 *
 * Beyond this it is not the same building under a longer name, it is a
 * different branch in the same city.
 */
const REFINEMENT_MAX_KM = 2;

/**
 * Find this operator's venue by name.
 *
 * Chain-scoped for the same reason the geo resolver is: "Tanza" identifies a
 * town, not a building, and matching across operators is how a cinema ends up
 * pinned to a rival's mall.
 *
 * `near` is the coordinate we already believe, if any. An **exact** name match
 * is trusted outright and may move a venue any distance — that is what fixed
 * Robinsons Place General Trias, which was 12.7 km out. A **containment** match
 * is only accepted when it lands within {@link REFINEMENT_MAX_KM} of `near`,
 * because containment alone cannot tell "Robinsons Starmills" ⊂ "Robinsons
 * Starmills Pampanga" (the same mall) from "Robinsons Place Tacloban" ⊂
 * "Robinsons North Tacloban" (two malls, 4 km apart).
 *
 * An `amenity=cinema` feature beats a `shop=mall` one when both match: the
 * cinema is what we are placing, and in a large mall the two differ by a couple
 * of hundred metres.
 */
export function findOsmVenue(
  name: string,
  chain: CinemaChain,
  near?: { lat: number; lng: number } | null,
): OsmMatch | null {
  const key = venueKey(name);
  if (key.length < 4) return null;

  const sameChain = osmVenues().filter((v) => v.chain === chain);

  const exact = sameChain.filter((v) => v.key === key);
  if (exact.length) return preferCinema(exact, true);

  // Containment, accepted only when unambiguous — two candidates means the
  // name does not identify one building, and an ambiguous pin is a wrong pin.
  let contained = sameChain.filter(
    (v) => v.key.length >= 4 && (v.key.includes(key) || key.includes(v.key)),
  );

  // Several matched: they may all be the same complex tagged more than once
  // (a mall polygon plus its cinema). Collapse only when they agree.
  if (contained.length > 1 && spreadKm(contained) >= 0.5) return null;
  if (!contained.length) return null;

  const match = preferCinema(contained, false);

  // Without a point to corroborate against, a containment match is a guess.
  if (!near) return null;
  return distanceKm(match, near) <= REFINEMENT_MAX_KM ? match : null;
}

function preferCinema(matches: OsmCandidate[], exact: boolean): OsmMatch {
  const chosen = matches.find((m) => m.kind === 'cinema') ?? matches[0];
  return { ...chosen, exact };
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** How far apart the furthest pair in a candidate set is, in km. */
function spreadKm(venues: OsmCandidate[]): number {
  let max = 0;
  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const dLat = (venues[j].lat - venues[i].lat) * 111;
      const dLng = (venues[j].lng - venues[i].lng) * 111 * Math.cos((venues[i].lat * Math.PI) / 180);
      max = Math.max(max, Math.hypot(dLat, dLng));
    }
  }
  return max;
}
