import { chromium, type Browser, type Page } from 'playwright';
import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedCinema,
  type ScrapedMovie,
  type ScrapedShowtime,
} from './base-scraper';
import type { CinemaChain } from '@/types';
import { SM_BRANCHES } from './venues';

/**
 * SM Cinema.
 *
 * smcinema.com renders its schedule client-side from an internal JSON endpoint.
 * Rather than parse the rendered DOM (which changes with every marketing
 * refresh), we drive a headless page and intercept the schedule XHR — the JSON
 * carries the screen name and format label that the DOM drops.
 *
 * If the response shape changes, `parseScheduleResponse` is the single place to
 * update; everything else is transport.
 */

interface SMScheduleResponse {
  // Shape is defensive on purpose — SM has shipped both of these envelopes.
  data?: SMScheduleCinema[];
  cinemas?: SMScheduleCinema[];
}

interface SMScheduleCinema {
  cinemaCode?: string;
  branchName?: string;
  cinemaName?: string;
  movies?: SMScheduleMovie[];
}

interface SMScheduleMovie {
  movieTitle?: string;
  title?: string;
  rating?: string;
  runtime?: string | number;
  synopsis?: string;
  posterUrl?: string;
  poster?: string;
  schedules?: SMSchedule[];
  showtimes?: SMSchedule[];
}

interface SMSchedule {
  screenName?: string;
  cinemaNo?: string;
  format?: string;
  experience?: string;
  time?: string;
  showTime?: string;
  price?: string | number;
  bookingUrl?: string;
}

const SCHEDULE_URL_HINT = /(schedule|showtime|cinema).*(json|api)|\/api\/.*(schedule|showtime)/i;

export class SMCinemaScraper extends BaseScraper {
  readonly source = 'sm-cinema';
  readonly chain: CinemaChain = 'SM';

  private readonly baseUrl = 'https://www.smcinema.com';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    const dates = options.dates ?? this.defaultDates();

    // Every known branch is emitted regardless of whether the schedule fetch
    // succeeds, so the map keeps its pins even on a bad scrape day.
    result.cinemas = SM_BRANCHES.map(
      (b): ScrapedCinema => ({
        name: b.name,
        slug: b.slug,
        chain: this.chain,
        lat: b.lat,
        lng: b.lng,
        address: b.address,
        city: b.city,
        website_url: this.baseUrl,
      }),
    );

    if (options.dryRun) return result;

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        locale: 'en-PH',
        timezoneId: 'Asia/Manila',
      });
      const page = await context.newPage();

      for (const date of dates) {
        try {
          const payloads = await this.captureSchedulePayloads(page, date);
          for (const payload of payloads) {
            this.parseScheduleResponse(payload, date, result);
          }
        } catch (err) {
          result.errors.push(`[${this.source}] ${date}: ${(err as Error).message}`);
        }
      }

      await context.close();
    } catch (err) {
      result.errors.push(`[${this.source}] browser: ${(err as Error).message}`);
    } finally {
      await browser?.close();
    }

    return result;
  }

  /** Navigate to the schedule page and collect every JSON response that looks like a schedule feed. */
  private async captureSchedulePayloads(page: Page, date: string): Promise<SMScheduleResponse[]> {
    const payloads: SMScheduleResponse[] = [];

    const onResponse = async (response: {
      url(): string;
      ok(): boolean;
      json(): Promise<unknown>;
    }) => {
      if (!response.ok() || !SCHEDULE_URL_HINT.test(response.url())) return;
      try {
        payloads.push((await response.json()) as SMScheduleResponse);
      } catch {
        // Not JSON after all — ignore.
      }
    };

    page.on('response', onResponse);
    await page.goto(`${this.baseUrl}/schedules?date=${date}`, {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });
    // Give lazily-triggered branch fetches a beat to land.
    await page.waitForTimeout(2_500);
    page.off('response', onResponse);

    return payloads;
  }

  private parseScheduleResponse(
    payload: SMScheduleResponse,
    date: string,
    result: ScrapeResult,
  ): void {
    const cinemas = payload.data ?? payload.cinemas ?? [];
    const seenMovies = new Set(result.movies.map((m) => m.slug));

    for (const cinema of cinemas) {
      const branchName = cinema.branchName ?? cinema.cinemaName;
      if (!branchName) continue;

      const branch = this.matchBranch(branchName);
      if (!branch) {
        result.errors.push(`[${this.source}] unmapped branch "${branchName}"`);
        continue;
      }

      for (const movie of cinema.movies ?? []) {
        const rawTitle = movie.movieTitle ?? movie.title;
        if (!rawTitle) continue;

        const title = this.cleanTitle(rawTitle);
        const movieSlug = this.slugify(title);

        if (!seenMovies.has(movieSlug)) {
          seenMovies.add(movieSlug);
          const scraped: ScrapedMovie = {
            title,
            slug: movieSlug,
            normalized_title: this.normalizeMovieTitle(rawTitle),
            synopsis: movie.synopsis,
            poster_url: movie.posterUrl ?? movie.poster,
            rating: movie.rating,
            duration_mins: this.parseRuntime(movie.runtime),
            category: 'Mainstream',
          };
          result.movies.push(scraped);
        }

        for (const slot of movie.schedules ?? movie.showtimes ?? []) {
          const time = slot.time ?? slot.showTime;
          if (!time) continue;

          try {
            const showtime: ScrapedShowtime = {
              cinema_slug: branch.slug,
              movie_slug: movieSlug,
              screen_name: slot.screenName ?? (slot.cinemaNo ? `Cinema ${slot.cinemaNo}` : undefined),
              format: this.detectFormat(rawTitle, slot.format, slot.experience, slot.screenName),
              start_time: this.toManilaISO(date, time),
              booking_url: slot.bookingUrl ?? `${this.baseUrl}/schedules?date=${date}`,
              ticket_price: this.parsePrice(slot.price),
            };
            result.showtimes.push(showtime);
          } catch (err) {
            result.errors.push(`[${this.source}] ${(err as Error).message}`);
          }
        }
      }
    }
  }

  /** SM writes branch names loosely ("SM Megamall Cinema", "SM CITY NORTH EDSA"). */
  private matchBranch(branchName: string) {
    const key = branchName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return SM_BRANCHES.find((b) => {
      const candidate = b.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return key.includes(candidate) || candidate.includes(key);
    });
  }

  private parseRuntime(runtime?: string | number): number | undefined {
    if (typeof runtime === 'number') return runtime;
    if (!runtime) return undefined;
    const mins = runtime.match(/(\d+)\s*m/i);
    const hours = runtime.match(/(\d+)\s*h/i);
    if (hours) return Number(hours[1]) * 60 + (mins ? Number(mins[1]) : 0);
    const plain = runtime.match(/\d+/);
    return plain ? Number(plain[0]) : undefined;
  }

  private parsePrice(price?: string | number): number | undefined {
    if (typeof price === 'number') return price;
    if (!price) return undefined;
    const match = price.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
}

export const smCinemaScraper = new SMCinemaScraper();
