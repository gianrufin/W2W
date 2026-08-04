import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';
import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedMovie,
} from './base-scraper';
import type { CinemaChain, MovieCategory } from '@/types';
import { INDIE_VENUES } from './venues';

/**
 * Indie venues, microcinemas and festivals.
 *
 * This tier does not have an API. Cinema '76 and Cinema Centenario publish a
 * weekly schedule page; festivals (Cinemalaya, QCinema, Eiga Sai) publish a
 * matrix per edition and then take it down when the run ends. So instead of one
 * parser we register a small source table and run whichever sources are live.
 *
 * Every film from this tier is tagged Indie or Festival — that tag is what
 * turns the pin amber on the map, and what the Festival Focus toggle filters on.
 */

interface IndieSource {
  id: string;
  url: string;
  /** Venues this source publishes schedules for. */
  venueSlugs: string[];
  category: MovieCategory;
  festivalName?: string;
  /** CSS selectors, kept per-source because none of these sites share markup. */
  selectors: {
    entry: string;
    title: string;
    time: string;
    venue?: string;
    poster?: string;
    synopsis?: string;
    booking?: string;
  };
}

const INDIE_SOURCES: IndieSource[] = [
  {
    id: 'cinema-76',
    url: 'https://www.cinema76.ph/screenings',
    venueSlugs: ['cinema-76-san-juan'],
    category: 'Indie',
    selectors: {
      entry: '.screening, article.event',
      title: '.title, h2, h3',
      time: '.time, [data-time]',
      poster: 'img',
      synopsis: '.synopsis, p',
      booking: 'a[href*="ticket"], a.book',
    },
  },
  {
    id: 'cinema-centenario',
    url: 'https://www.cinemacentenario.com/schedule',
    venueSlugs: ['cinema-centenario'],
    category: 'Indie',
    selectors: {
      entry: '.schedule-item, article',
      title: '.film-title, h2, h3',
      time: '.showtime, [data-time]',
      poster: 'img',
      booking: 'a[href*="ticket"]',
    },
  },
  {
    id: 'cinemalaya',
    url: 'https://www.cinemalaya.org/schedule',
    venueSlugs: ['ccp-tanghalang-manuel-conde', 'gateway-cineplex', 'up-cine-adarna'],
    category: 'Festival',
    festivalName: 'Cinemalaya 2026',
    selectors: {
      entry: '.screening-row, tr.schedule-row',
      title: '.film, td.film, h3',
      time: '.time, td.time',
      venue: '.venue, td.venue',
      poster: 'img',
      booking: 'a[href*="ticket"]',
    },
  },
  {
    id: 'qcinema',
    url: 'https://qcinema.ph/schedule',
    venueSlugs: ['gateway-cineplex', 'trinoma', 'red-carpet-shangri-la'],
    category: 'Festival',
    festivalName: 'QCinema 2026',
    selectors: {
      entry: '.schedule-entry, tr',
      title: '.film-title, td:nth-child(2)',
      time: '.time, td:nth-child(1)',
      venue: '.venue, td:nth-child(3)',
      booking: 'a[href*="ticket"]',
    },
  },
  {
    id: 'eiga-sai',
    url: 'https://jfmo.org.ph/eigasai/schedule',
    venueSlugs: ['red-carpet-shangri-la', 'cinematheque-manila', 'up-cine-adarna'],
    category: 'Festival',
    festivalName: 'Eiga Sai 2026',
    selectors: {
      entry: '.screening, tr',
      title: '.film-title, td:nth-child(2)',
      time: '.time, td:nth-child(1)',
      venue: '.venue, td:nth-child(3)',
    },
  },
];

export class MicrocinemaScraper extends BaseScraper {
  readonly source = 'microcinemas';
  readonly chain: CinemaChain = 'Microcinema';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    const dates = options.dates ?? this.defaultDates(7);

    result.cinemas = INDIE_VENUES.map((v) => ({
      name: v.name,
      slug: v.slug,
      chain: v.chain,
      lat: v.lat,
      lng: v.lng,
      address: v.address,
      city: v.city,
    }));

    if (options.dryRun) return result;

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ locale: 'en-PH', timezoneId: 'Asia/Manila' });
      const page = await context.newPage();

      for (const source of INDIE_SOURCES) {
        try {
          await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForTimeout(1_500);
          this.parseSource(await page.content(), source, dates, result);
        } catch (err) {
          // A festival that is between editions simply 404s — that is expected,
          // not a failure of the run.
          result.errors.push(`[${this.source}:${source.id}] ${(err as Error).message}`);
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

  parseSource(html: string, source: IndieSource, dates: string[], result: ScrapeResult): void {
    const $ = cheerio.load(html);
    const seenMovies = new Set(result.movies.map((m) => m.slug));

    $(source.selectors.entry).each((_, node) => {
      const el = $(node);
      const rawTitle = el.find(source.selectors.title).first().text().trim();
      if (!rawTitle) return;

      const title = this.cleanTitle(rawTitle);
      const movieSlug = this.slugify(
        source.festivalName ? `${title}-${source.festivalName}` : title,
      );

      if (!seenMovies.has(movieSlug)) {
        seenMovies.add(movieSlug);
        const movie: ScrapedMovie = {
          title,
          slug: movieSlug,
          normalized_title: this.normalizeMovieTitle(rawTitle),
          synopsis: source.selectors.synopsis
            ? el.find(source.selectors.synopsis).first().text().trim() || undefined
            : undefined,
          poster_url: source.selectors.poster
            ? el.find(source.selectors.poster).first().attr('src') ?? undefined
            : undefined,
          category: source.category,
          festival_name: source.festivalName,
        };
        result.movies.push(movie);
      }

      const venueSlug = this.resolveVenue(
        source,
        source.selectors.venue ? el.find(source.selectors.venue).first().text() : '',
      );
      const bookingUrl = source.selectors.booking
        ? el.find(source.selectors.booking).first().attr('href')
        : undefined;

      el.find(source.selectors.time).each((__, timeNode) => {
        const text = $(timeNode).text().trim();
        // Indie pages often print "Aug 5 · 7:00 PM" in one cell.
        const parsed = this.parseIndieSlot(text, dates);
        if (!parsed) return;

        result.showtimes.push({
          cinema_slug: venueSlug,
          movie_slug: movieSlug,
          screen_name: undefined,
          format: this.detectFormat(rawTitle),
          start_time: parsed,
          booking_url: bookingUrl ? new URL(bookingUrl, source.url).toString() : source.url,
        });
      });
    });
  }

  /**
   * Festival rows name their venue in prose ("CCP Tanghalang Manuel Conde",
   * "Gateway Cineplex 18"). Match it against the venues this source declares,
   * falling back to the source's primary venue.
   */
  private resolveVenue(source: IndieSource, venueText: string): string {
    const key = venueText.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (key) {
      const hit = source.venueSlugs.find((slug) => {
        const venue = INDIE_VENUES.find((v) => v.slug === slug);
        if (!venue) return false;
        const candidate = venue.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return candidate.includes(key) || key.includes(candidate);
      });
      if (hit) return hit;
    }
    return source.venueSlugs[0];
  }

  /** Accepts "7:00 PM", "Aug 5 · 7:00 PM" and "2026-08-05 19:00". */
  private parseIndieSlot(text: string, dates: string[]): string | null {
    const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/);
    if (isoMatch) {
      try {
        return this.toManilaISO(isoMatch[1], isoMatch[2]);
      } catch {
        return null;
      }
    }

    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    if (!timeMatch) return null;

    const monthDay = text.match(
      /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})/i,
    );
    let date = dates[0];
    if (monthDay) {
      const month = String(
        ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(
          monthDay[1].toUpperCase().slice(0, 3),
        ) + 1,
      ).padStart(2, '0');
      const day = monthDay[2].padStart(2, '0');
      const year = dates[0].slice(0, 4);
      date = `${year}-${month}-${day}`;
    }

    try {
      return this.toManilaISO(date, timeMatch[1]);
    } catch {
      return null;
    }
  }
}

export const microcinemaScraper = new MicrocinemaScraper();
