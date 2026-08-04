import { ALL_VENUES } from './venues';
import { fetchTheaterDirectory, type DirectoryVenue } from './clickthecity';

/**
 * Branch name → coordinates.
 *
 * Chains are unreliable about location data in exactly the way that matters:
 * Ayala's booking API returns `location: null` for every one of its sites, so
 * 17 real cinemas with real schedules had nowhere to go on the map and were
 * being dropped. Robinsons, Megaworld and Vista do not expose coordinates at
 * all — they return a branch name and nothing else.
 *
 * Two sources, in order:
 *
 *   1. `venues.ts`, the hand-checked registry. Small, exact, and the right
 *      place to pin something the automated match gets wrong.
 *   2. ClickTheCity's directory, ~144 venues nationwide with coordinates.
 *
 * A venue that matches neither is **reported, not guessed**. Dropping a cinema
 * costs someone a listing; placing it in the wrong city costs someone a trip.
 */

export interface ResolvedLocation {
  lat: number;
  lng: number;
  city?: string;
  address?: string;
  /** Which source placed it — surfaced in the run summary. */
  via: 'registry' | 'directory';
}

/**
 * Reduce a branch name to a comparison key.
 *
 * The same cinema is written six ways across six systems: "GALLERIA ORTIGAS",
 * "Robinsons Galleria Ortigas", "Robinsons Movieworld Galleria". Stripping the
 * operator names, the words for "mall" and "cinema", and all punctuation leaves
 * the part that actually identifies the place.
 *
 * Only the operator's own branding and the filler words come out. Words that
 * are part of the venue's actual name stay — stripping "lifestyle" and "center"
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

/**
 * A resolver bound to one scrape run.
 *
 * The directory is fetched once and shared, because every scraper needs it and
 * it is ~10 requests. Build it with {@link createGeoResolver}.
 */
export class GeoResolver {
  private readonly index = new Map<string, ResolvedLocation>();

  /**
   * Precedence, most trustworthy first:
   *
   *   1. registry entries marked `verified` — a person checked these
   *   2. the ClickTheCity directory — a real listings database
   *   3. the rest of the registry — typed by hand, unchecked
   *
   * The order used to be registry-then-directory on the reasoning that
   * hand-written beats scraped. An audit disproved it: the unverified registry
   * entry for Evia Lifestyle Center was 4.28 km out, and it was *winning*. The
   * directory now outranks anything nobody has actually looked at.
   */
  constructor(directory: DirectoryVenue[]) {
    for (const venue of ALL_VENUES.filter((v) => v.verified)) {
      this.add(venue.name, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'registry',
      });
    }
    for (const venue of directory) {
      this.add(venue.name, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'directory',
      });
    }
    for (const venue of ALL_VENUES.filter((v) => !v.verified)) {
      this.add(venue.name, {
        lat: venue.lat,
        lng: venue.lng,
        city: venue.city,
        address: venue.address,
        via: 'registry',
      });
    }
  }

  private add(name: string, location: ResolvedLocation): void {
    const key = venueKey(name);
    if (key && !this.index.has(key)) this.index.set(key, location);
  }

  /**
   * Resolve a branch name, optionally with the city the chain reported.
   *
   * Tries the exact key, then a containment match in either direction — "SM
   * City Baguio" against a directory entry of "SM Baguio", and the reverse.
   * Containment is only accepted when exactly one candidate matches; two
   * candidates means the name is ambiguous, and an ambiguous pin is a wrong
   * pin.
   */
  resolve(name: string, city?: string | null): ResolvedLocation | null {
    const key = venueKey(name);
    if (!key) return null;

    const exact = this.index.get(key);
    if (exact) return exact;

    const withCity = city ? this.index.get(venueKey(`${name} ${city}`)) : undefined;
    if (withCity) return withCity;

    const candidates: ResolvedLocation[] = [];
    for (const [candidateKey, location] of this.index) {
      // Short keys ("cebu") match far too much to be trusted by containment.
      if (candidateKey.length < 5 || key.length < 5) continue;
      if (candidateKey.includes(key) || key.includes(candidateKey)) candidates.push(location);
    }

    return candidates.length === 1 ? candidates[0] : null;
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
