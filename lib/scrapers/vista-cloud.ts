import { chromium, type Browser } from 'playwright';
import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedCinema,
  type ScrapedMovie,
} from './base-scraper';
import type { CinemaChain, MovieCategory } from '@/types';
import { ALL_VENUES } from './venues';

/**
 * Vista Cloud (OCAPI) scraper — covers SM Cinema and Ayala All Access.
 *
 * Both chains run the same platform, so this is one implementation rather than
 * two DOM parsers. The flow:
 *
 *   1. The bearer token is published, unauthenticated, in the site's Next.js
 *      page data as `pageProps.environment.gasToken`. Only this step needs a
 *      browser — the web hosts sit behind Cloudflare, while the API hosts do
 *      not, so everything after this is plain fetch.
 *   2. GET /ocapi/v1/sites            — every cinema, with real coordinates
 *   3. GET /ocapi/v1/films            — the catalogue
 *   4. GET /ocapi/v1/film-screening-dates?siteIds=…  — which dates have screenings
 *   5. GET /ocapi/v1/showtimes/by-business-date/{date}?siteIds=…  — the sessions
 *
 * Screen names, censor ratings and format attributes all arrive in the
 * `relatedData` block of each response, so nothing has to be inferred from
 * marketing copy.
 */

interface VistaTenant {
  key: string;
  chain: CinemaChain;
  /** Cloudflare-protected; only used to read the token. */
  webHost: string;
  /** Not behind Cloudflare — safe to call directly. */
  apiHost: string;
  /** Poster CDN for this tenant. */
  cdnHost: string;
}

const TENANTS: VistaTenant[] = [
  {
    key: 'sm-cinema',
    chain: 'SM',
    webHost: 'https://www.smcinema.com',
    apiHost: 'https://digital-api.smcinema.com',
    cdnHost: 'https://smcine-digital-cdn.app.vista.co',
  },
  {
    key: 'ayala-cinemas',
    chain: 'Ayala',
    webHost: 'https://www.ayalaallaccess.com',
    apiHost: 'https://digital-api.ayalaallaccess.com',
    cdnHost: 'https://ayala-digital-cdn.app.vista.co',
  },
];

// ---- API shapes (only the fields we use) -----------------------------------

interface Localised {
  text: string;
}

interface VistaSite {
  id: string;
  name: Localised;
  location?: { latitude: number; longitude: number } | null;
  contactDetails?: {
    address?: { line1?: string | null; line2?: string | null; city?: string | null } | null;
  } | null;
}

interface VistaFilm {
  id: string;
  title: Localised;
  synopsis?: Localised | null;
  censorRatingId?: string | null;
  runtimeInMinutes?: number | null;
  releaseDate?: string | null;
  genreIds?: string[];
}

interface VistaShowtime {
  id: string;
  filmId: string;
  siteId: string;
  screenId?: string | null;
  attributeIds?: string[];
  isSoldOut?: boolean;
  schedule: { businessDate: string; startsAt: string };
}

interface RelatedData {
  films?: VistaFilm[];
  sites?: VistaSite[];
  screens?: Array<{ id: string; name: Localised }>;
  attributes?: Array<{ id: string; name: Localised; shortName?: Localised | null }>;
  censorRatings?: Array<{ id: string; classification: Localised }>;
  genres?: Array<{ id: string; name: Localised }>;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class VistaCloudScraper extends BaseScraper {
  readonly source: string;
  readonly chain: CinemaChain;

  constructor(private readonly tenant: VistaTenant) {
    super();
    this.source = tenant.key;
    this.chain = tenant.chain;
  }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    const dates = options.dates ?? this.defaultDates();
    if (options.dryRun) return result;

    let token: string;
    try {
      token = await this.fetchToken();
    } catch (err) {
      result.errors.push(`[${this.source}] token: ${(err as Error).message}`);
      return result;
    }

    // ---- sites -------------------------------------------------------------
    let sites: VistaSite[] = [];
    try {
      const body = await this.api<{ sites: VistaSite[] }>(token, '/ocapi/v1/sites');
      const placeable: VistaSite[] = [];
      for (const site of body.sites ?? []) {
        const cinema = this.toCinema(site);
        if (cinema) {
          result.cinemas.push(cinema);
          placeable.push(site);
        } else {
          result.errors.push(
            `[${this.source}] no coordinates for "${site.name.text}" (${site.id}) — ` +
              'add it to lib/scrapers/venues.ts to place it on the map',
          );
        }
      }
      // Only fetch sessions for venues that can actually be shown.
      sites = placeable;
    } catch (err) {
      result.errors.push(`[${this.source}] sites: ${(err as Error).message}`);
      return result;
    }

    // ---- catalogue ---------------------------------------------------------
    const filmsById = new Map<string, VistaFilm>();
    let ratings = new Map<string, string>();
    try {
      const body = await this.api<{ films: VistaFilm[]; relatedData?: RelatedData }>(
        token,
        '/ocapi/v1/films',
      );
      ratings = this.indexText(body.relatedData?.censorRatings, (r) => r.classification.text);
      for (const film of body.films ?? []) filmsById.set(film.id, film);
    } catch (err) {
      result.errors.push(`[${this.source}] films: ${(err as Error).message}`);
    }

    // ---- sessions, per site ------------------------------------------------
    const wanted = new Set(dates);
    const seenMovies = new Set<string>();
    const concurrency = options.maxConcurrency ?? 4;

    for (let i = 0; i < sites.length; i += concurrency) {
      const batch = sites.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (site) => {
          try {
            const available = await this.screeningDates(token, site.id);
            for (const date of available.filter((d) => wanted.has(d))) {
              const body = await this.api<{ showtimes: VistaShowtime[]; relatedData?: RelatedData }>(
                token,
                `/ocapi/v1/showtimes/by-business-date/${date}?siteIds=${site.id}`,
              );

              const screens = this.indexText(body.relatedData?.screens, (s) => s.name.text);
              const attributes = this.indexText(
                body.relatedData?.attributes,
                (a) => a.shortName?.text || a.name.text,
              );
              // Later pages carry films the global catalogue may have missed.
              for (const film of body.relatedData?.films ?? []) {
                if (!filmsById.has(film.id)) filmsById.set(film.id, film);
              }
              for (const [id, text] of this.indexText(
                body.relatedData?.censorRatings,
                (r) => r.classification.text,
              )) {
                if (!ratings.has(id)) ratings.set(id, text);
              }

              for (const showtime of body.showtimes ?? []) {
                const film = filmsById.get(showtime.filmId);
                if (!film) continue;

                const movieSlug = this.slugify(`${film.title.text}-${film.id}`);
                if (!seenMovies.has(movieSlug)) {
                  seenMovies.add(movieSlug);
                  result.movies.push(this.toMovie(film, movieSlug, ratings));
                }

                const screenName = showtime.screenId ? screens.get(showtime.screenId) : undefined;
                const attributeNames = (showtime.attributeIds ?? [])
                  .map((id) => attributes.get(id))
                  .filter(Boolean)
                  .join(' ');

                result.showtimes.push({
                  cinema_slug: this.siteSlug(site),
                  movie_slug: movieSlug,
                  screen_name: screenName,
                  // The platform states the format outright, so detectFormat is
                  // only normalising vocabulary here rather than guessing.
                  format: this.detectFormat(attributeNames, screenName),
                  // Already ISO with +08:00 — no reconstruction needed.
                  start_time: showtime.schedule.startsAt,
                  booking_url: `${this.tenant.webHost}/sites/${this.slugify(site.name.text)}/${site.id}`,
                });
              }
            }
          } catch (err) {
            result.errors.push(`[${this.source}] site ${site.id}: ${(err as Error).message}`);
          }
        }),
      );
    }

    return result;
  }

  /**
   * The token is public page data, but the web host is behind Cloudflare, so a
   * real browser is the reliable way to read it. Everything else is plain HTTP.
   */
  private async fetchToken(): Promise<string> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: UA, locale: 'en-PH' });
      const page = await context.newPage();
      await page.goto(this.tenant.webHost, { waitUntil: 'domcontentloaded', timeout: 45_000 });

      const token = await page.evaluate(() => {
        const el = document.getElementById('__NEXT_DATA__');
        if (!el?.textContent) return null;
        const data = JSON.parse(el.textContent) as {
          props?: { pageProps?: { environment?: { gasToken?: string } } };
        };
        return data.props?.pageProps?.environment?.gasToken ?? null;
      });

      if (!token) throw new Error('gasToken not present in __NEXT_DATA__');
      return token;
    } finally {
      await browser?.close();
    }
  }

  private async api<T>(token: string, path: string): Promise<T> {
    const res = await fetch(`${this.tenant.apiHost}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': UA },
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  private async screeningDates(token: string, siteId: string): Promise<string[]> {
    const body = await this.api<{
      filmScreeningDates?: Array<{ businessDate: string }>;
    }>(token, `/ocapi/v1/film-screening-dates?siteIds=${siteId}`);
    return (body.filmScreeningDates ?? []).map((d) => d.businessDate);
  }

  /** Slug is name + id, because chains reuse mall names across cities. */
  private siteSlug(site: VistaSite): string {
    return this.slugify(`${this.tenant.key}-${site.name.text}-${site.id}`);
  }

  private toCinema(site: VistaSite): ScrapedCinema | null {
    if (!site.location) return null;
    const address = site.contactDetails?.address;
    return {
      name: site.name.text,
      slug: this.siteSlug(site),
      chain: this.chain,
      lat: site.location.latitude,
      lng: site.location.longitude,
      address: [address?.line1, address?.line2].filter(Boolean).join(', ') || undefined,
      city: address?.city || address?.line2 || undefined,
      website_url: this.tenant.webHost,
    };
  }

  private toMovie(film: VistaFilm, slug: string, ratings: Map<string, string>): ScrapedMovie {
    const title = film.title.text;
    // Chains list festival entries under their own banner — tag them so the
    // indie/festival filter and Festival Focus pick them up.
    const festival = title.match(/^(Cinemalaya|QCinema|Cinema One|Eiga Sai)\b/i)?.[1];
    const category: MovieCategory = festival ? 'Festival' : 'Mainstream';

    return {
      title: this.cleanTitle(title),
      slug,
      normalized_title: this.normalizeMovieTitle(title),
      synopsis: film.synopsis?.text || undefined,
      poster_url: `${this.tenant.cdnHost}/media/entity/get/FilmPosterGraphic/${film.id}?width=500`,
      rating: film.censorRatingId ? ratings.get(film.censorRatingId) : undefined,
      duration_mins: film.runtimeInMinutes ?? undefined,
      category,
      festival_name: festival ? `${festival} 2026` : undefined,
    };
  }

  private indexText<T extends { id: string }>(
    items: T[] | undefined,
    pick: (item: T) => string,
  ): Map<string, string> {
    const map = new Map<string, string>();
    for (const item of items ?? []) map.set(item.id, pick(item));
    return map;
  }
}

export const smCinemaScraper = new VistaCloudScraper(TENANTS[0]);
export const ayalaCinemaScraper = new VistaCloudScraper(TENANTS[1]);
export const VISTA_CLOUD_SCRAPERS = [smCinemaScraper, ayalaCinemaScraper];
