import * as cheerio from 'cheerio';
import { BaseScraper, type ScrapeOptions, type ScrapeResult } from './base-scraper';
import { httpText, mapWithConcurrency } from './http';
import { createGeoResolver } from './geo';
import type { CinemaChain, MovieCategory } from '@/types';

/**
 * TicketNet — Gateway Cineplex 18 and Gateway Mall 2, in Araneta City.
 *
 * No API and no need for one: TicketNet renders the schedule server-side, so
 * this is a two-request-deep HTML read. It is also the only source that carries
 * Cinemalaya's commercial run, which is ticketed here rather than through any
 * of the chains — the festival's own site never published a per-film grid.
 *
 *   GET /gateway-cineplex-18-movies    — the venue's current titles
 *   GET /event-detail/{slug}           — one row per date, plus times per screen
 *
 * Each detail row carries the etix.com checkout link the venue actually uses,
 * so unlike most of the indie tier these showtimes get a real booking URL.
 */

const BASE = 'https://www.ticketnet.com.ph';

/** The venues TicketNet sells cinema tickets for, and their listing pages. */
const VENUES: ReadonlyArray<{ slug: string; name: string; listing: string }> = [
  {
    slug: 'ticketnet-gateway-cineplex-18',
    name: 'Gateway Cineplex 18',
    listing: '/gateway-cineplex-18-movies',
  },
];

/** Festivals whose titles TicketNet lists under the festival's own banner. */
const FESTIVAL_PATTERNS: ReadonlyArray<{ pattern: RegExp; festival: string }> = [
  { pattern: /\bcinemalaya\b/i, festival: 'Cinemalaya 2026' },
  { pattern: /\bqcinema\b/i, festival: 'QCinema 2026' },
  { pattern: /\bcinema\s*one\b/i, festival: 'Cinema One Originals 2026' },
  { pattern: /\beiga\s*sai\b/i, festival: 'Eiga Sai 2026' },
];

export class TicketNetScraper extends BaseScraper {
  readonly source = 'ticketnet';
  readonly chain: CinemaChain = 'Araneta';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    const wanted = new Set(options.dates ?? this.defaultDates());
    const geo = await createGeoResolver();

    for (const venue of VENUES) {
      const location = geo.resolve(venue.name, this.chain);
      if (!location) {
        result.errors.push(
          `[${this.source}] no coordinates for "${venue.name}" — ` +
            'add it to lib/scrapers/venues.ts to place it on the map',
        );
        continue;
      }

      result.cinemas.push({
        name: venue.name,
        slug: venue.slug,
        chain: this.chain,
        lat: location.lat,
        lng: location.lng,
        address: location.address,
        city: location.city,
        website_url: `${BASE}${venue.listing}`,
      });

      let eventPaths: string[];
      try {
        eventPaths = this.listEvents(await httpText(`${BASE}${venue.listing}`));
      } catch (err) {
        result.errors.push(`[${this.source}] ${venue.name}: ${(err as Error).message}`);
        continue;
      }

      const seenMovies = new Set<string>();
      await mapWithConcurrency(eventPaths, options.maxConcurrency ?? 3, async (path) => {
        try {
          const html = await httpText(`${BASE}${path}`);
          this.parseEvent(html, venue.slug, wanted, seenMovies, result);
        } catch (err) {
          result.errors.push(`[${this.source}] ${path}: ${(err as Error).message}`);
        }
      });
    }

    return result;
  }

  /** The listing page links each title at /event-detail/{slug}. */
  listEvents(html: string): string[] {
    const $ = cheerio.load(html);
    const paths = new Set<string>();
    for (const node of $('a[href*="/event-detail/"]').toArray()) {
      const href = $(node).attr('href');
      if (href) paths.add(new URL(href, BASE).pathname);
    }
    return [...paths];
  }

  /**
   * Read one event page.
   *
   * Structurally: each `<tr>` is one date. `a.ticketlist` gives the title, that
   * date and the checkout link; the sibling `.eventscheduledetail` lists the
   * times, grouped by screen as "CINEMA 17 - 3:30 PM | 6:00 PM".
   */
  parseEvent(
    html: string,
    cinemaSlug: string,
    wanted: Set<string>,
    seenMovies: Set<string>,
    result: ScrapeResult,
  ): void {
    const $ = cheerio.load(html);

    for (const row of $('tr').toArray()) {
      const el = $(row);
      const anchor = el.find('a.ticketlist').first();
      const heading = anchor.text().trim();
      if (!heading) continue;

      // "TOY STORY 5 - August 05, 2026 | 06:00 PM"
      const match = /^(.*?)\s+-\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/.exec(heading);
      if (!match) continue;

      const rawTitle = match[1].trim();
      const date = parseLongDate(match[2]);
      if (!date || !wanted.has(date)) continue;

      const bookingUrl = anchor.attr('href') || el.find('a.btn').first().attr('href') || undefined;

      const festival = FESTIVAL_PATTERNS.find((f) => f.pattern.test(rawTitle))?.festival;
      const category: MovieCategory = festival ? 'Festival' : 'Mainstream';
      const movieSlug = this.slugify(`tn-${rawTitle}`);

      if (!seenMovies.has(movieSlug)) {
        seenMovies.add(movieSlug);
        result.movies.push({
          title: this.cleanTitle(rawTitle),
          slug: movieSlug,
          normalized_title: this.normalizeMovieTitle(rawTitle),
          category,
          festival_name: festival,
        });
      }

      for (const line of el.find('.eventscheduledetail li').toArray()) {
        const text = $(line).text().trim();
        // The first <li> is the literal word "SCHEDULE:".
        if (!text || /^schedule:?$/i.test(text)) continue;

        const [screenPart, ...timeParts] = text.split(/\s+-\s+/);
        const screen = timeParts.length ? screenPart.trim() : undefined;
        const times = (timeParts.length ? timeParts.join(' - ') : text)
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean);

        for (const time of times) {
          try {
            result.showtimes.push({
              cinema_slug: cinemaSlug,
              movie_slug: movieSlug,
              screen_name: screen,
              format: this.detectFormat(screen, rawTitle),
              start_time: this.toManilaISO(date, time),
              booking_url: bookingUrl,
            });
          } catch (err) {
            result.errors.push(`[${this.source}] ${rawTitle}: ${(err as Error).message}`);
          }
        }
      }
    }
  }
}

const LONG_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "August 05, 2026" → "2026-08-05". */
export function parseLongDate(text: string): string | null {
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  if (!match) return null;

  const month = LONG_MONTHS.indexOf(match[1].toLowerCase()) + 1;
  if (!month) return null;

  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

export const ticketNetScraper = new TicketNetScraper();
