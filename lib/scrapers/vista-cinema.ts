import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';
import { BaseScraper, type ScrapeOptions, type ScrapeResult } from './base-scraper';
import type { CinemaChain } from '@/types';
import { VISTA_BRANCHES } from './venues';

/**
 * Vista Cinemas.
 *
 * Vista's schedule page carries the ticketing deep link on each time chip, so
 * the booking URL is taken verbatim — it encodes the session id the checkout
 * flow needs and cannot be reconstructed from the branch page alone.
 */
export class VistaCinemaScraper extends BaseScraper {
  readonly source = 'vista-cinemas';
  readonly chain: CinemaChain = 'Vista';

  private readonly baseUrl = 'https://www.vistacinemas.com.ph';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    const dates = options.dates ?? this.defaultDates();

    result.cinemas = VISTA_BRANCHES.map((b) => ({
      name: b.name,
      slug: b.slug,
      chain: this.chain,
      lat: b.lat,
      lng: b.lng,
      address: b.address,
      city: b.city,
      website_url: this.baseUrl,
    }));

    if (options.dryRun) return result;

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ locale: 'en-PH', timezoneId: 'Asia/Manila' });
      const page = await context.newPage();

      for (const branch of VISTA_BRANCHES) {
        for (const date of dates) {
          try {
            await page.goto(`${this.baseUrl}/showtimes/${branch.slug}?date=${date}`, {
              waitUntil: 'domcontentloaded',
              timeout: 45_000,
            });
            await page.waitForTimeout(1_200);
            this.parseBranchHtml(await page.content(), branch.slug, date, result);
          } catch (err) {
            result.errors.push(
              `[${this.source}] ${branch.slug} ${date}: ${(err as Error).message}`,
            );
          }
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

  parseBranchHtml(html: string, cinemaSlug: string, date: string, result: ScrapeResult): void {
    const $ = cheerio.load(html);
    const seenMovies = new Set(result.movies.map((m) => m.slug));

    $('.movie-row, .film-card, [data-film]').each((_, node) => {
      const el = $(node);
      const rawTitle = (el.find('.film-title, .movie-name, h3').first().text() || el.attr('data-film') || '').trim();
      if (!rawTitle) return;

      const title = this.cleanTitle(rawTitle);
      const movieSlug = this.slugify(title);

      if (!seenMovies.has(movieSlug)) {
        seenMovies.add(movieSlug);
        result.movies.push({
          title,
          slug: movieSlug,
          normalized_title: this.normalizeMovieTitle(rawTitle),
          poster_url: el.find('img').first().attr('src') ?? undefined,
          rating: el.find('.mtrcb-rating, .rating').first().text().trim() || undefined,
          category: 'Mainstream',
        });
      }

      el.find('a.showtime, .time-chip, [data-session]').each((__, slotNode) => {
        const slot = $(slotNode);
        const time = (slot.attr('data-time') || slot.text()).trim();
        if (!time) return;

        const href = slot.attr('href');
        const formatText = slot.attr('data-format') || slot.find('.format').text() || '';
        const screenName = slot.attr('data-screen') || undefined;

        try {
          result.showtimes.push({
            cinema_slug: cinemaSlug,
            movie_slug: movieSlug,
            screen_name: screenName,
            format: this.detectFormat(rawTitle, formatText, screenName),
            start_time: this.toManilaISO(date, time),
            booking_url: href
              ? new URL(href, this.baseUrl).toString()
              : `${this.baseUrl}/showtimes/${cinemaSlug}`,
            ticket_price: this.parsePrice(slot.attr('data-price')),
          });
        } catch (err) {
          result.errors.push(`[${this.source}] ${(err as Error).message}`);
        }
      });
    });
  }

  private parsePrice(text?: string): number | undefined {
    if (!text) return undefined;
    const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
}

export const vistaCinemaScraper = new VistaCinemaScraper();
