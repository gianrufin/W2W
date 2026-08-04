import { ALL_VENUES } from './venues';
import { fetchTheaterDirectory, type DirectoryVenue } from './clickthecity';
import type { CinemaChain } from '@/types';

/**
 * Branch name → coordinates.
 *
 * Chains are unreliable about location data in exactly the way that matters:
 * Ayala's booking API returns `location: null` for every one of its sites, so
 * 17 real cinemas with real schedules had nowhere to go on the map and were
 * being dropped. Robinsons, Megaworld and Vista do not expose coordinates at
 * all — they return a branch name and nothing else.
 *
 * Two sources:
 *
 *   1. `venues.ts`, the hand registry. Entries marked `verified` have been
 *      corroborated against an independent map and outrank everything.
 *   2. ClickTheCity's directory, ~144 venues nationwide with coordinates.
 *
 * A venue that matches neither is **reported, not guessed**. Dropping a cinema
 * costs someone a listing; placing it in the wrong city costs someone a trip.
 *
 * ## Matching is scoped to the operator, and that is not optional
 *
 * `venueKey` strips the operator's branding so a chain's own inconsistent
 * spellings reconcile — "GALLERIA ORTIGAS" and "Robinsons Movieworld Galleria
 * Ortigas" must land on the same key. The cost is that it also collapses
 * *different* operators in the same town:
 *
 *   venueKey('Vista Mall Tanza')  === 'tanza'
 *   venueKey('SM City Tanza')     === 'tanza'
 *
 * With a single flat index, whichever was inserted first won and every other
 * chain's branch in that town silently inherited its coordinates. That shipped:
 * Vista Cinemas Tanza was pinned on top of SM City Tanza, and Vista General
 * Trias on top of Robinsons General Trias.
 *
 * So the index is keyed by `chain|key`, and a lookup without a matching chain
 * finds nothing. A Vista branch can never borrow SM's coordinates, and a venue
 * with no same-chain match is reported unmapped rather than placed on a rival's
 * doorstep.
 */

export interface ResolvedLocation {
  lat: number;
  lng: number;
  city?: string;
  address?: string;
  /** Which source placed it — surfaced in the run summary. */
  via: 'registry' | 'directory';
  /** The operator whose entry supplied this point. Always the one asked for. */
  chain: CinemaChain;
}

/**
 * Reduce a branch name to a comparison key.
 *
 * The same cinema is written six ways across six systems: "GALLERIA ORTIGAS",
 * "Robinsons Galleria Ortigas", "Robinsons Movieworld Galleria". Stripping the
 * operator names, the words for "mall" and "cinema", and all punctuation leaves
 * the part that actually identifies the place *within one operator*. Across
 * operators it is ambiguous by construction — see the note above.
 *
 * Only the operator's own branding and filler words come out. Words that are
 * part of the venue's actual name stay: stripping "lifestyle" and "center"
 * turned "Vista Cinemas at Evia Lifestyle Center" into the four-letter key
 * "evia", too short to match anything safely.
 */
const OPERATOR_NOISE =
  /\b(robinsons?|movieworld|sm|smcinema|ayala|malls?|vista|starmall|megaworld|cineplex|cinemas?|cinema|the|at|city|place|mall|premier)\b/g;

export function venueKey(name: string): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(OPERATOR_NOISE, ' ')
    .replace(/\s+/g, '');
}

interface IndexedVenue {
  key: string;
  chain: CinemaChain;
  location: ResolvedLocation;
  name: string;
}

/**
 * A resolver bound to one scrape run.
 *
 * The directory is fetched once and shared, because every scraper needs it and
 * it is ~10 requests. Build it with {@link createGeoResolver}.
 */
export class GeoResolver {
  /** `chain|key` → the point. Never a bare key: see the note at the top. */
  private readonly index = new Map<string, ResolvedLocation>();
  private readonly all: IndexedVenue[] = [];

  /**
   * Precedence, most trustworthy first:
   *
   *   1. registry entries marked `verified` — corroborated against a real map
   *   2. the ClickTheCity directory — a real listings database
   *   3. the rest of the registry — typed by hand, unchecked
   *
   * The order used to be registry-then-directory on the reasoning that
   * hand-written beats scraped. An audit disproved it: the unverified registry
   * entry for Evia Lifestyle Center was 4.28 km out, and it was *winning*.
   */
  constructor(directory: DirectoryVenue[]) {
    for (const venue of ALL_VENUES.filter((v) => v.verified)) {
      this.add(venue.name, venue.chain, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'registry',
        chain: venue.chain,
      });
    }
    for (const venue of directory) {
      this.add(venue.name, venue.chain, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'directory',
        chain: venue.chain,
      });
    }
    for (const venue of ALL_VENUES.filter((v) => !v.verified)) {
      this.add(venue.name, venue.chain, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'registry',
        chain: venue.chain,
      });
    }
  }

  private add(name: string, chain: CinemaChain, location: ResolvedLocation): void {
    const key = venueKey(name);
    if (!key) return;
    this.all.push({ key, chain, location, name });
    const scoped = `${chain}|${key}`;
    if (!this.index.has(scoped)) this.index.set(scoped, location);
  }

  /**
   * Resolve a branch name for a known operator.
   *
   * `chain` is required. Without it there is no way to tell Vista Tanza from SM
   * Tanza, and guessing between them is how a cinema ends up pinned to a rival's
   * building.
   *
   * Tries the exact key, then the key with the city appended, then containment
   * in either direction — "SM City Baguio" against a directory entry of "SM
   * Baguio", and the reverse. Containment is accepted only when exactly one
   * same-chain candidate matches; two means the name is ambiguous, and an
   * ambiguous pin is a wrong pin.
   */
  resolve(name: string, chain: CinemaChain, city?: string | null): ResolvedLocation | null {
    const key = venueKey(name);
    if (!key) return null;

    const exact = this.index.get(`${chain}|${key}`);
    if (exact) return exact;

    if (city) {
      const withCity = this.index.get(`${chain}|${venueKey(`${name} ${city}`)}`);
      if (withCity) return withCity;
    }

    // Short keys ("cebu") match far too much to be trusted by containment.
    if (key.length < 5) return null;

    let candidates = this.all.filter(
      (v) =>
        v.chain === chain &&
        v.key.length >= 5 &&
        (v.key.includes(key) || key.includes(v.key)),
    );

    // A city narrows a genuinely ambiguous name within one chain — SM has more
    // than one branch in several cities.
    if (candidates.length > 1 && city) {
      const inCity = candidates.filter(
        (v) => (v.location.city ?? '').toLowerCase() === city.toLowerCase(),
      );
      if (inCity.length) candidates = inCity;
    }

    return candidates.length === 1 ? candidates[0].location : null;
  }

  /**
   * Venues sharing a point with a venue of a different operator.
   *
   * Two cinemas genuinely can sit in the same mall complex, but two *different
   * chains* at the same coordinate to five decimal places is the signature of
   * the cross-chain collision this class now prevents. Surfaced so a scrape run
   * can report it rather than waiting for someone to notice on the map.
   */
  collisions(): Array<{ point: string; venues: string[] }> {
    const byPoint = new Map<string, IndexedVenue[]>();
    for (const v of this.all) {
      const point = `${v.location.lat.toFixed(5)},${v.location.lng.toFixed(5)}`;
      byPoint.set(point, [...(byPoint.get(point) ?? []), v]);
    }

    const out: Array<{ point: string; venues: string[] }> = [];
    for (const [point, venues] of byPoint) {
      if (new Set(venues.map((v) => v.chain)).size > 1) {
        out.push({ point, venues: venues.map((v) => `${v.name} [${v.chain}]`) });
      }
    }
    return out;
  }

  get size(): number {
    return this.index.size;
  }
}

let cached: Promise<GeoResolver> | null = null;

/**
 * Shared resolver for a run. Cached so five scrapers do not each re-fetch the
 * same directory; the process is short-lived, so there is nothing to expire.
 */
export function createGeoResolver(): Promise<GeoResolver> {
  if (!cached) {
    cached = fetchTheaterDirectory()
      .then((directory) => new GeoResolver(directory))
      // A directory outage must not take the chain scrapers down with it — the
      // hand registry alone still places the venues it knows.
      .catch(() => new GeoResolver([]));
  }
  return cached;
}

/** Test seam: forget the cached resolver. */
export function resetGeoResolver(): void {
  cached = null;
}
