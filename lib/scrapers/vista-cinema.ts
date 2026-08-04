import * as cheerio from 'cheerio';
import { BaseScraper, type ScrapeOptions, type ScrapeResult } from './base-scraper';
import { httpJson, httpText, mapWithConcurrency } from './http';
import { createGeoResolver } from './geo';
import type { CinemaChain } from '@/types';

/**
 * Vista Cinemas — the Villar group's malls in Cavite, Laguna, Bataan, Pampanga
 * and the southern Metro Manila fringe.
 *
 * Unrelated to Vista Cloud, the ticketing platform SM and Ayala both run on,
 * despite the shared name.
 *
 * This replaces a version built on guessed CSS selectors, which loaded pages
 * successfully and matched nothing. The real front-end is ASP.NET MVC serving
 * HTML *fragments* to a jQuery selector widget, and those fragments are stable
 * and tiny:
 *
 *   GET /Branches/GetBranchesSlug            — JSON: every branch
 *   GET /Home/MovieSelectorBranches          — <li data-value=branchKey>
 *   GET /Home/MovieSelectorMovies?branchKey= — <li data-code= data-value=title>
 *   GET /Home/MovieSelectorSchedule?branchKey=&movieName=
 *
 * Only the branches in MovieSelectorBranches are worth walking — that list is
 * already filtered to the ones with a live schedule, so the other dozen cost
 * nothing to skip.
 *
 * The schedule fragment is a flat <ul> rather than a tree: a date header, then
 * a screen header, then that screen's times, repeating. Parsing is therefore a
 * small state machine over the list items, in document order.
 */

const BASE = 'https://www.vistacinemas.com.ph';

/** The fragment prints "Aug 05" with no year, so the year has to be inferred. */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface BranchSlug {
  Branch_Key: number;
  Branch_Name: string;
  Branch_Slug: string | null;
}

export class VistaCinemaScraper extends BaseScraper {
  readonly source = 'vista-cinemas';
  readonly chain: CinemaChain = 'Vista';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    const wanted = new Set(options.dates ?? this.defaultDates());

    let named: BranchSlug[] = [];
    try {
      named = await httpJson<BranchSlug[]>(`${BASE}/Branches/GetBranchesSlug`);
    } catch (err) {
      // Not fatal: the selector fragment carries names too, just less tidy ones.
      result.errors.push(`[${this.source}] branch list: ${(err as Error).message}`);
    }
    const nameByKey = new Map(named.map((b) => [b.Branch_Key, b.Branch_Name]));

    let active: Array<{ key: number; name: string }>;
    try {
      const html = await httpText(`${BASE}/Home/MovieSelectorBranches`);
      const $ = cheerio.load(html);
      active = $('li[data-value]')
        .toArray()
        .map((node) => {
          const key = Number($(node).attr('data-value'));
          return { key, name: nameByKey.get(key) ?? $(node).text().trim() };
        })
        .filter((b) => Number.isFinite(b.key) && b.name);
    } catch (err) {
      result.errors.push(`[${this.source}] active branches: ${(err as Error).message}`);
      return result;
    }

    const geo = await createGeoResolver();
    const slugByKey = new Map<number, string>();

    for (const branch of active) {
      const location = geo.resolve(branch.name, this.chain);
      if (!location) {
        result.errors.push(
          `[${this.source}] no coordinates for "${branch.name}" — ` +
            'add it to lib/scrapers/venues.ts to place it on the map',
        );
        continue;
      }

      const slug = this.slugify(`vista-${branch.name}-${branch.key}`);
      slugByKey.set(branch.key, slug);
      result.cinemas.push({
        name: branch.name,
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
    const placed = active.filter((b) => slugByKey.has(b.key));

    await mapWithConcurrency(placed, options.maxConcurrency ?? 3, async (branch) => {
      const cinemaSlug = slugByKey.get(branch.key)!;
      try {
        const html = await httpText(`${BASE}/Home/MovieSelectorMovies?branchKey=${branch.key}`);
        const $ = cheerio.load(html);

        for (const node of $('li[data-value]').toArray()) {
          const title = ($(node).attr('data-value') ?? '').trim();
          const code = ($(node).attr('data-code') ?? '').trim();
          if (!title) continue;

          const movieSlug = this.slugify(`vista-${title}-${code || 'nocode'}`);
          if (!seenMovies.has(movieSlug)) {
            seenMovies.add(movieSlug);
            result.movies.push({
              title: this.cleanTitle(title),
              slug: movieSlug,
              normalized_title: this.normalizeMovieTitle(title),
              category: 'Mainstream',
            });
          }

          const schedule = await httpText(
            `${BASE}/Home/MovieSelectorSchedule?branchKey=${branch.key}` +
              `&movieName=${encodeURIComponent(title)}`,
          );
          this.parseSchedule(schedule, cinemaSlug, movieSlug, title, wanted, result);
        }
      } catch (err) {
        result.errors.push(`[${this.source}] ${branch.name}: ${(err as Error).message}`);
      }
    });

    return result;
  }

  /**
   * Read the flat schedule fragment.
   *
   * Items arrive in document order as: a date header ("Aug 05"), a screen
   * header ("Cinema 6 - DOLBY ATMOS"), then the times on that screen, then the
   * next screen, then the next date. Class names distinguish the three, so the
   * parser just carries the current date and screen forward.
   */
  parseSchedule(
    html: string,
    cinemaSlug: string,
    movieSlug: string,
    title: string,
    wanted: Set<string>,
    result: ScrapeResult,
  ): void {
    const $ = cheerio.load(html);

    let date: string | null = null;
    let screen: string | undefined;

    for (const node of $('li').toArray()) {
      const el = $(node);
      const text = el.text().trim();
      if (!text) continue;

      const classes = el.attr('class') ?? '';

      if (classes.includes('home-list-schedule')) {
        if (!date || !wanted.has(date)) continue;
        try {
          result.showtimes.push({
            cinema_slug: cinemaSlug,
            movie_slug: movieSlug,
            screen_name: screen,
            // The screen label is where Vista states the format: the house is
            // named "Cinema 6 - DOLBY ATMOS", not the film.
            format: this.detectFormat(screen, title),
            start_time: this.toManilaISO(date, text),
            // data-value is the session id the checkout needs; the site has no
            // GET route that accepts it, so the schedule page is the link.
            booking_url: `${BASE}/MovieSchedules`,
          });
        } catch (err) {
          result.errors.push(`[${this.source}] ${(err as Error).message}`);
        }
        continue;
      }

      if (classes.includes('unclickable')) {
        screen = text;
        continue;
      }

      const parsed = parseFragmentDate(text);
      if (parsed) {
        date = parsed;
        // A new date restarts the screen grouping.
        screen = undefined;
      }
    }
  }
}

/**
 * "Aug 05" → "2026-08-05".
 *
 * No year is printed, and the schedule spans a year boundary every December, so
 * the year is chosen as whichever reading lands nearest to today rather than
 * assumed to be the current one.
 */
export function parseFragmentDate(text: string, now = new Date()): string | null {
  const match = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2})$/.exec(text.trim());
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  if (!month || !day) return null;

  // Compare in Manila time; the runner is on UTC and would roll the date early.
  const manilaNow = new Date(now.getTime() + 8 * 3_600_000);
  const thisYear = manilaNow.getUTCFullYear();

  const candidates = [thisYear - 1, thisYear, thisYear + 1].map((year) => ({
    year,
    delta: Math.abs(Date.UTC(year, month - 1, day) - Date.UTC(
      thisYear,
      manilaNow.getUTCMonth(),
      manilaNow.getUTCDate(),
    )),
  }));
  candidates.sort((a, b) => a.delta - b.delta);

  const year = candidates[0].year;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const vistaCinemaScraper = new VistaCinemaScraper();
