import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedCinema,
} from './base-scraper';
import { httpJson, mapWithConcurrency } from './http';
import type { CinemaChain } from '@/types';

/**
 * ClickTheCity — the nationwide backstop.
 *
 * Every other scraper here talks to one chain's own booking system, which is
 * authoritative but only covers that chain. ClickTheCity indexes 140-odd
 * cinemas across the country, including the ones with no bookable website at
 * all: Power Plant, Greenhills, Ortigas Estancia, Sta. Lucia East, Bichara
 * SilverScreens in Legazpi. Without it those venues simply do not exist on the
 * map, which is the opposite of the point.
 *
 * Two things it provides that nothing else does:
 *
 *   1. **Coordinates for every venue.** The chains' own APIs are inconsistent
 *      about this — Ayala returns `location: null` for every site it has — so
 *      this directory is also what geocodes the rest of the pipeline. See
 *      `geo.ts`.
 *   2. **Screen-level schedules** for venues nobody else publishes.
 *
 * What it does *not* provide is a booking deep-link, so where a chain scraper
 * covers the same venue the chain wins. `SUPERSEDED_BY_NATIVE_SCRAPER` is how
 * that precedence is expressed, and it is deliberately conservative: only the
 * chains actually confirmed live are listed.
 *
 * Endpoints, all unauthenticated GET JSON:
 *   /api/movies/nearby-malls?latitude=&longitude=&page=   — the directory
 *   /api/movies/theater/{slug}?date=YYYY-MM-DD            — one venue's day
 */

const BASE = 'https://www.clickthecity.com';

/** How the directory's logo URL identifies an operator. */
const LOGO_CHAINS: ReadonlyArray<{ marker: string; chain: CinemaChain }> = [
  { marker: 'sm-supermall', chain: 'SM' },
  { marker: 'robinsons-malls', chain: 'Robinsons' },
  { marker: 'ayala-malls', chain: 'Ayala' },
  { marker: 'megaworld', chain: 'Megaworld' },
];

/**
 * Venues whose operator the logo does not identify. Matched against the slug,
 * longest pattern first so `vista-mall-nomo` is not caught by a bare `vista`
 * rule intended for something else.
 */
const SLUG_CHAINS: ReadonlyArray<{ pattern: RegExp; chain: CinemaChain }> = [
  // The big three appear here as well as in LOGO_CHAINS because the directory
  // does not always carry a logo: "SM Pampanga" had none, fell through to
  // Independent, and shipped as a second pin on top of "SM City Pampanga".
  { pattern: /^sm-/, chain: 'SM' },
  { pattern: /^robinsons-/, chain: 'Robinsons' },
  { pattern: /^ayala-/, chain: 'Ayala' },
  { pattern: /^(vista-mall|evia-lifestyle|starmall)/, chain: 'Vista' },
  { pattern: /^gateway-mall/, chain: 'Araneta' },
  { pattern: /^(century-city-mall|lucky-chinatown|uptown|venice|eastwood|festive-walk)/, chain: 'Megaworld' },
  { pattern: /^newport/, chain: 'Newport' },
  { pattern: /^(shangri-?la|red-carpet)/, chain: 'ShangriLa' },
  { pattern: /^fisher/, chain: 'Fisher' },
];

/**
 * Chains whose own booking system we scrape directly. Their showtimes are
 * dropped from this source so the aggregator never overwrites a row that
 * carries a real ticket link — but their *venues* are still taken, because the
 * coordinates are the reason this exists.
 */
const SUPERSEDED_BY_NATIVE_SCRAPER: ReadonlyArray<CinemaChain> = [
  'SM',
  'Ayala',
  'Robinsons',
  'Megaworld',
  'Vista',
];

/**
 * Individual venues a native scraper already covers, where the chain rule is
 * too blunt. `gateway-mall` is Gateway Cineplex 18, which TicketNet scrapes
 * with real etix checkout links; `gateway-mall-2` is a different building in
 * the same complex and nothing else covers it, so it stays.
 */
const SUPERSEDED_SLUGS: ReadonlySet<string> = new Set(['gateway-mall']);

interface DirectoryRow {
  id: number;
  slug: string;
  name: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  logo_url?: string | null;
}

interface TheaterFilm {
  movieId: number;
  title: string;
  poster?: string | null;
  mtrcb_rating?: string | null;
  running_time?: string | null;
}

interface TheaterDay {
  status?: boolean;
  theater?: {
    id: number;
    name: string;
    slug: string;
    city?: string | null;
    address?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    /** Dates this venue has anything scheduled for. Saves ~6 empty requests. */
    available_schedule?: string[];
  } | null;
  now_showing?: TheaterFilm[];
  schedules?: Array<{
    movieId: number;
    date: string;
    theaterName: string;
    showtimes: string[];
  }>;
}

/** A venue as the directory describes it, with the operator resolved. */
export interface DirectoryVenue {
  slug: string;
  name: string;
  chain: CinemaChain;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
}

/**
 * Every cinema the directory knows, deduplicated by id.
 *
 * `nearby-malls` is nominally a proximity query but returns the same complete
 * list from any anchor — verified by running it from Manila, Cebu, Davao,
 * Baguio, Iloilo and Cagayan de Oro and getting an identical set. One anchor is
 * therefore enough; the paging loop is what actually matters.
 */
export async function fetchTheaterDirectory(): Promise<DirectoryVenue[]> {
  const byId = new Map<number, DirectoryVenue>();

  for (let page = 1; page <= 20; page += 1) {
    const body = await httpJson<{ data?: DirectoryRow[] }>(
      `${BASE}/api/movies/nearby-malls?latitude=14.5995&longitude=120.9842&page=${page}`,
    );
    const rows = body.data ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      // A venue we cannot place is worse than one we omit: a pin in the wrong
      // city sends someone on a trip for a screening that is not there.
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      byId.set(row.id, {
        slug: row.slug,
        name: row.name,
        chain: chainFor(row),
        lat,
        lng,
        address: [row.address1, row.address2].filter(Boolean).join(', ') || undefined,
        city: row.city || undefined,
      });
    }
  }

  return [...byId.values()];
}

function chainFor(row: DirectoryRow): CinemaChain {
  const logo = row.logo_url ?? '';
  for (const { marker, chain } of LOGO_CHAINS) {
    if (logo.includes(marker)) return chain;
  }
  for (const { pattern, chain } of SLUG_CHAINS) {
    if (pattern.test(row.slug)) return chain;
  }
  // Power Plant, Greenhills, Bichara and friends: real cinemas, no chain.
  return 'Independent';
}

export class ClickTheCityScraper extends BaseScraper {
  readonly source = 'clickthecity';
  // Nominal only — every cinema this emits carries the chain resolved above.
  readonly chain: CinemaChain = 'Independent';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    const wanted = new Set(options.dates ?? this.defaultDates());

    let directory: DirectoryVenue[];
    try {
      directory = await fetchTheaterDirectory();
    } catch (err) {
      result.errors.push(`[${this.source}] directory: ${(err as Error).message}`);
      return result;
    }

    const scheduled = directory.filter(
      (v) => !SUPERSEDED_BY_NATIVE_SCRAPER.includes(v.chain) && !SUPERSEDED_SLUGS.has(v.slug),
    );

    // Only venues this source actually schedules become cinema rows.
    //
    // It used to emit all 144, on the reasoning that the directory is the only
    // source with coordinates for every chain. That reasoning was wrong about
    // where the coordinates go: `geo.ts` reads this directory over the API, not
    // out of the database, so the chains get their coordinates either way. All
    // the extra rows did was put a second, scheduleless pin on top of 40
    // cinemas a chain scraper had already placed — "Robinsons Place Antipolo"
    // sitting directly on "Robinsons Movieworld Antipolo".
    for (const venue of scheduled) {
      result.cinemas.push(this.toCinema(venue));
    }
    const seenMovies = new Set<string>();

    await mapWithConcurrency(scheduled, options.maxConcurrency ?? 4, async (venue) => {
      try {
        await this.scrapeVenue(venue, wanted, seenMovies, result);
      } catch (err) {
        result.errors.push(`[${this.source}] ${venue.slug}: ${(err as Error).message}`);
      }
    });

    return result;
  }

  private async scrapeVenue(
    venue: DirectoryVenue,
    wanted: Set<string>,
    seenMovies: Set<string>,
    result: ScrapeResult,
  ): Promise<void> {
    // The first response lists which dates exist, so the remaining requests are
    // only for days that actually have something on — a venue showing nothing
    // this week costs one request instead of seven.
    const [firstDate] = [...wanted];
    const first = await this.day(venue.slug, firstDate);

    const days: TheaterDay[] = [first];
    for (const date of first.theater?.available_schedule ?? []) {
      if (date === firstDate || !wanted.has(date)) continue;
      days.push(await this.day(venue.slug, date));
    }

    for (const day of days) {
      const titles = new Map<number, TheaterFilm>();
      for (const film of day.now_showing ?? []) titles.set(film.movieId, film);

      for (const block of day.schedules ?? []) {
        if (!wanted.has(block.date)) continue;

        const film = titles.get(block.movieId);
        if (!film) continue;

        // Keyed on ClickTheCity's own film id so two chains' spellings of the
        // same release still collapse to one movie row.
        const movieSlug = this.slugify(`ctc-${film.title}-${film.movieId}`);
        if (!seenMovies.has(movieSlug)) {
          seenMovies.add(movieSlug);
          result.movies.push({
            title: this.cleanTitle(film.title),
            slug: movieSlug,
            normalized_title: this.normalizeMovieTitle(film.title),
            poster_url: film.poster || undefined,
            rating: film.mtrcb_rating || undefined,
            duration_mins: parseRunningTime(film.running_time),
            category: 'Mainstream',
          });
        }

        for (const time of block.showtimes) {
          try {
            result.showtimes.push({
              cinema_slug: this.venueSlug(venue.slug),
              movie_slug: movieSlug,
              screen_name: block.theaterName,
              // The screen name is where the format hides here — "Dolby Atmos
              // Cinema 2" is how Power Plant labels its premium house.
              format: this.detectFormat(block.theaterName, film.title),
              start_time: this.toManilaISO(block.date, time),
              // A listing page, not a checkout: this source has no deep link,
              // and inventing one would send people to a dead URL.
              booking_url: `${BASE}/movies/theaters/${venue.slug}`,
            });
          } catch (err) {
            result.errors.push(`[${this.source}] ${venue.slug}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  private day(slug: string, date: string): Promise<TheaterDay> {
    return httpJson<TheaterDay>(`${BASE}/api/movies/theater/${slug}?date=${date}`);
  }

  /** Namespaced so an aggregator venue never collides with a chain's own row. */
  private venueSlug(slug: string): string {
    return `ctc-${slug}`;
  }

  private toCinema(venue: DirectoryVenue): ScrapedCinema {
    return {
      name: venue.name,
      slug: this.venueSlug(venue.slug),
      chain: venue.chain,
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
      city: venue.city,
      website_url: `${BASE}/movies/theaters/${venue.slug}`,
    };
  }
}

/** "2 hrs 25 min" → 145. Returns undefined rather than guessing at garbage. */
function parseRunningTime(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const hours = Number(/(\d+)\s*hr/.exec(text)?.[1] ?? 0);
  const minutes = Number(/(\d+)\s*min/.exec(text)?.[1] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

export const clickTheCityScraper = new ClickTheCityScraper();
