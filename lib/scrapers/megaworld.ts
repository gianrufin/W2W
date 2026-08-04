import { BaseScraper, type ScrapeOptions, type ScrapeResult } from './base-scraper';
import { httpJson, parseDotNetDate } from './http';
import { createGeoResolver } from './geo';
import type { CinemaChain } from '@/types';

/**
 * Megaworld Lifestyle Malls — Uptown BGC, Eastwood, Venice, Newport, Lucky
 * Chinatown and Festive Walk Iloilo.
 *
 * The cheapest source in the whole pipeline: two endpoints, no auth, no cookie,
 * no browser, and `GetMovieSchedule.aspx` returns the entire tree for a branch
 * in one response — films, screens, formats, every session with its price.
 * Seven requests cover the chain.
 *
 *   POST /GetBranches.aspx
 *   POST /GetMovieSchedule.aspx  (form field: branch=<Branch_Key>)
 *
 * Same vendor as Robinsons, so the same ASP.NET `/Date(ms)/` timestamps — but
 * unlike Robinsons this one answers without the XHR header, and unlike
 * Robinsons it returns plain JSON rather than JSON-in-a-string.
 */

const BASE = 'https://megaworldcinemas.com';

interface Branch {
  Branch_Key: number;
  Branch_Name: string;
  Branch_Code: string;
}

interface ScheduleRow {
  MctKey: string;
  StartTime: string;
  Price?: number | null;
  ScreeningType?: number | null;
}

interface CinemaRow {
  Cinema: string;
  CinemaCode: string;
  MovieCode: string;
  ScheduleList?: ScheduleRow[];
}

interface BranchRow {
  Branch: string;
  BranchKey: number;
  BranchCode: string;
  CinemaList?: CinemaRow[];
}

interface MovieRow {
  MovieName: string;
  Synopsis?: string | null;
  ImageThumb?: string | null;
  MtrcbRating?: string | null;
  BranchList?: BranchRow[];
}

export class MegaworldScraper extends BaseScraper {
  readonly source = 'megaworld-cinemas';
  readonly chain: CinemaChain = 'Megaworld';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    const wanted = new Set(options.dates ?? this.defaultDates());

    let branches: Branch[];
    try {
      const body = await httpJson<{ BranchList?: Branch[] }>(`${BASE}/GetBranches.aspx`, {
        method: 'POST',
      });
      branches = body.BranchList ?? [];
    } catch (err) {
      result.errors.push(`[${this.source}] branches: ${(err as Error).message}`);
      return result;
    }

    const geo = await createGeoResolver();
    const slugByKey = new Map<number, string>();

    for (const branch of branches) {
      const location = geo.resolve(branch.Branch_Name);
      if (!location) {
        result.errors.push(
          `[${this.source}] no coordinates for "${branch.Branch_Name}" — ` +
            'add it to lib/scrapers/venues.ts to place it on the map',
        );
        continue;
      }

      const slug = this.slugify(`mwc-${branch.Branch_Name}-${branch.Branch_Key}`);
      slugByKey.set(branch.Branch_Key, slug);
      result.cinemas.push({
        name: branch.Branch_Name,
        slug,
        chain: this.chain,
        lat: location.lat,
        lng: location.lng,
        address: location.address,
        city: location.city,
        website_url: BASE,
      });
    }

    const seenMovies = new Set<string>();

    for (const branch of branches) {
      if (!slugByKey.has(branch.Branch_Key)) continue;
      try {
        // The page posts `branch` as a form field, but the handler reads the
        // query string too — which keeps the request bodyless and avoids the
        // 411 these hosts return for a POST with no Content-Length.
        const movies = await httpJson<MovieRow[]>(
          `${BASE}/GetMovieSchedule.aspx?branch=${branch.Branch_Key}`,
          { method: 'POST' },
        );

        this.collect(movies, branch, slugByKey, wanted, seenMovies, result);
      } catch (err) {
        result.errors.push(`[${this.source}] ${branch.Branch_Name}: ${(err as Error).message}`);
      }
    }

    return result;
  }

  /**
   * Walk one branch's response.
   *
   * The payload is movie-major but repeats the whole branch tree inside every
   * film, so it is filtered back down to the branch that was actually asked
   * for — otherwise a six-branch chain would be ingested six times over.
   */
  private collect(
    movies: MovieRow[],
    branch: Branch,
    slugByKey: Map<number, string>,
    wanted: Set<string>,
    seenMovies: Set<string>,
    result: ScrapeResult,
  ): void {
    for (const movie of movies) {
      const movieSlug = this.slugify(`mwc-${movie.MovieName}`);
      let recorded = false;

      for (const branchRow of movie.BranchList ?? []) {
        if (branchRow.BranchKey !== branch.Branch_Key) continue;
        const cinemaSlug = slugByKey.get(branchRow.BranchKey);
        if (!cinemaSlug) continue;

        for (const screen of branchRow.CinemaList ?? []) {
          for (const session of screen.ScheduleList ?? []) {
            const startTime = parseDotNetDate(session.StartTime);
            if (!startTime) continue;
            if (!wanted.has(startTime.slice(0, 10))) continue;

            if (!recorded && !seenMovies.has(movieSlug)) {
              seenMovies.add(movieSlug);
              recorded = true;
              result.movies.push({
                title: this.cleanTitle(movie.MovieName),
                slug: movieSlug,
                normalized_title: this.normalizeMovieTitle(movie.MovieName),
                synopsis: movie.Synopsis || undefined,
                poster_url:
                  movie.ImageThumb && !/default_image/i.test(movie.ImageThumb)
                    ? movie.ImageThumb
                    : undefined,
                rating: movie.MtrcbRating || undefined,
                category: 'Mainstream',
              });
            }

            result.showtimes.push({
              cinema_slug: cinemaSlug,
              movie_slug: movieSlug,
              screen_name: screen.Cinema,
              format: this.detectFormat(screen.Cinema, movie.MovieName),
              start_time: startTime,
              // Checkout is a WebForms postback with no addressable URL, so the
              // branch's own page is the honest destination.
              booking_url: `${BASE}/`,
              ticket_price: session.Price ?? undefined,
            });
          }
        }
      }
    }
  }
}

export const megaworldScraper = new MegaworldScraper();
