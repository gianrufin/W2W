import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedShowtime,
} from './base-scraper';
import { CookieJar, httpFetch, httpJson, mapWithConcurrency, parseDotNetDate } from './http';
import { createGeoResolver } from './geo';
import type { CinemaChain } from '@/types';

/**
 * Robinsons Movieworld — the widest nationwide footprint after SM.
 *
 * The site is a jQuery front-end over an ASP.NET webservice. The endpoints are
 * unauthenticated but guarded by two quirks that both return a plain 404, which
 * is why an earlier pass concluded they did not exist:
 *
 *   1. `X-Requested-With: XMLHttpRequest` is mandatory. Without it every route
 *      under /webservice/ answers "The resource cannot be found."
 *   2. The `SERVER` cookie from any page load pins the load-balancer backend.
 *
 * With both in place the flow is four calls:
 *
 *   POST /webservice/getbranches
 *   POST /webservice/getmovieswithdetailsbybranch?branchKey=      — catalogue
 *   POST /webservice/GetScreeningDetailsList?branchKey=&movieName= — which days
 *   POST /webservice/getschedulesbybranchandmovie?movieDate=&branchId=&movieCode=
 *
 * Responses are JSON strings containing JSON, and timestamps are ASP.NET
 * `/Date(ms)/`; `http.ts` handles both.
 *
 * Robinsons publishes no coordinates, so every branch is placed through the geo
 * resolver. Branches it cannot place are reported rather than guessed at.
 */

const BASE = 'https://robinsonsmovieworld.com';

interface Branch {
  Branch_Key: number;
  Branch_Name: string;
  Branch_Code: string | null;
}

interface Film {
  Movie_Code: string;
  Movie_Name: string;
  Mtrcb_Rating?: string | null;
  RunningTime?: number | null;
  Synopsis?: string | null;
  Image?: string | null;
  Genre?: string | null;
}

interface ScreeningDay {
  ScreeningDate: string;
  MovieCode: string;
  MovieFormat?: string | null;
}

interface Session {
  MCT_Key: number;
  Cinema_Name: string;
  Start_Time: string;
  Price?: number | null;
  Allow_Online_Purchase?: boolean;
}

export class RobinsonsScraper extends BaseScraper {
  readonly source = 'robinsons-movieworld';
  readonly chain: CinemaChain = 'Robinsons';

  private readonly jar = new CookieJar();

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    const wanted = new Set(options.dates ?? this.defaultDates());

    try {
      await this.warmSession();
    } catch (err) {
      result.errors.push(`[${this.source}] session: ${(err as Error).message}`);
      return result;
    }

    let branches: Branch[];
    try {
      const body = await this.call<{ BranchList?: Branch[] }>('/webservice/getbranches');
      branches = body.BranchList ?? [];
    } catch (err) {
      result.errors.push(`[${this.source}] branches: ${(err as Error).message}`);
      return result;
    }

    const geo = await createGeoResolver();
    const placed: Array<{ branch: Branch; slug: string }> = [];

    for (const branch of branches) {
      const location = geo.resolve(`Robinsons ${branch.Branch_Name}`);
      if (!location) {
        result.errors.push(
          `[${this.source}] no coordinates for "${branch.Branch_Name}" — ` +
            'add it to lib/scrapers/venues.ts to place it on the map',
        );
        continue;
      }

      const slug = this.branchSlug(branch);
      placed.push({ branch, slug });
      result.cinemas.push({
        name: this.branchName(branch),
        slug,
        chain: this.chain,
        lat: location.lat,
        lng: location.lng,
        address: location.address,
        city: location.city,
        website_url: BASE,
      });
    }

    // The per-branch catalogue returns an empty `Movie_Code` for every film,
    // and the schedule endpoint keys on that code — so the codes come from the
    // global catalogue and are matched back by title.
    const codeByTitle = new Map<string, string>();
    try {
      const catalogue = await this.call<Film[]>('/webservice/getmovieswithdetails');
      for (const film of catalogue) {
        if (film.Movie_Code) codeByTitle.set(film.Movie_Name.trim().toUpperCase(), film.Movie_Code);
      }
    } catch (err) {
      result.errors.push(`[${this.source}] catalogue: ${(err as Error).message}`);
      return result;
    }

    const seenMovies = new Set<string>();
    await mapWithConcurrency(placed, options.maxConcurrency ?? 4, async ({ branch, slug }) => {
      try {
        await this.scrapeBranch(branch, slug, wanted, seenMovies, result, codeByTitle);
      } catch (err) {
        result.errors.push(
          `[${this.source}] ${branch.Branch_Name}: ${(err as Error).message}`,
        );
      }
    });

    return result;
  }

  private async scrapeBranch(
    branch: Branch,
    cinemaSlug: string,
    wanted: Set<string>,
    seenMovies: Set<string>,
    result: ScrapeResult,
    codeByTitle: Map<string, string>,
  ): Promise<void> {
    const films = await this.call<Film[]>(
      `/webservice/getmovieswithdetailsbybranch?branchKey=${branch.Branch_Key}`,
    );

    for (const film of films) {
      const movieCode = film.Movie_Code || codeByTitle.get(film.Movie_Name.trim().toUpperCase());
      // A title the global catalogue has no code for is a "coming soon" tile;
      // the schedule endpoint keys on the code, so there is nothing to fetch.
      if (!movieCode) continue;

      const days = await this.call<{ Data?: ScreeningDay[] }>(
        `/webservice/GetScreeningDetailsList?branchKey=${branch.Branch_Key}` +
          `&movieName=${encodeURIComponent(film.Movie_Name)}`,
      );

      const dates = new Set<string>();
      const formatByDate = new Map<string, string>();
      for (const day of days.Data ?? []) {
        const iso = parseDotNetDate(day.ScreeningDate);
        if (!iso) continue;
        const date = iso.slice(0, 10);
        if (!wanted.has(date)) continue;
        dates.add(date);
        if (day.MovieFormat) formatByDate.set(date, day.MovieFormat);
      }
      if (!dates.size) continue;

      const movieSlug = this.slugify(`rmw-${film.Movie_Name}-${movieCode}`);
      if (!seenMovies.has(movieSlug)) {
        seenMovies.add(movieSlug);
        result.movies.push({
          title: this.cleanTitle(film.Movie_Name),
          slug: movieSlug,
          normalized_title: this.normalizeMovieTitle(film.Movie_Name),
          synopsis: film.Synopsis || undefined,
          // The CMS serves a placeholder for films with no artwork; passing it
          // through would put a broken-looking tile on the card.
          poster_url: film.Image && !/no_image/i.test(film.Image) ? film.Image : undefined,
          rating: film.Mtrcb_Rating || undefined,
          duration_mins: film.RunningTime ?? undefined,
          category: 'Mainstream',
        });
      }

      for (const date of dates) {
        const sessions = await this.call<Session[]>(
          `/webservice/getschedulesbybranchandmovie?movieDate=${date}` +
            `&branchId=${branch.Branch_Key}&movieCode=${encodeURIComponent(movieCode)}`,
        );

        for (const session of sessions) {
          const startTime = parseDotNetDate(session.Start_Time);
          if (!startTime) continue;

          const showtime: ScrapedShowtime = {
            cinema_slug: cinemaSlug,
            movie_slug: movieSlug,
            screen_name: session.Cinema_Name,
            format: this.detectFormat(
              formatByDate.get(date),
              session.Cinema_Name,
              film.Movie_Name,
            ),
            start_time: startTime,
            // Robinsons encrypts its booking query string, so there is no
            // stable per-session URL to link to. The branch page is honest.
            booking_url: `${BASE}/cinema/nowshowing`,
            ticket_price: session.Price ?? undefined,
          };
          result.showtimes.push(showtime);
        }
      }
    }
  }

  /**
   * Load a real page first. The webservice routes are served by a farm and the
   * `SERVER` cookie is what pins us to a backend that has them.
   */
  private async warmSession(): Promise<void> {
    const response = await httpFetch(`${BASE}/cinema/nowshowing`);
    if (!response.ok) throw new Error(`warm-up → ${response.status}`);
    this.jar.absorb(response);
    await response.text();
  }

  private call<T>(path: string): Promise<T> {
    return httpJson<T>(`${BASE}${path}`, {
      method: 'POST',
      cookie: this.jar.header,
      // Without this header every one of these routes answers 404.
      headers: { 'x-requested-with': 'XMLHttpRequest', referer: `${BASE}/cinema/nowshowing` },
    });
  }

  /** Branch names arrive in caps ("GALLERIA ORTIGAS"); title-case them. */
  private branchName(branch: Branch): string {
    const pretty = branch.Branch_Name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return `Robinsons Movieworld ${pretty}`;
  }

  private branchSlug(branch: Branch): string {
    return this.slugify(`rmw-${branch.Branch_Name}-${branch.Branch_Key}`);
  }
}

export const robinsonsScraper = new RobinsonsScraper();
