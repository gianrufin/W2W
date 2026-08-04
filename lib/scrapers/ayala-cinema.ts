import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';
import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedShowtime,
} from './base-scraper';
import type { CinemaChain } from '@/types';
import { AYALA_BRANCHES } from './venues';

/**
 * Ayala Malls Cinemas (sureseats.com / Ayala All Access).
 *
 * The schedule is server-rendered, so we let Playwright settle the page and
 * hand the HTML to Cheerio. Ayala is the chain that actually labels premium
 * experiences — Dolby Atmos and A-Luxe live in a badge element next to the
 * screen number rather than in the movie title, so both are fed to
 * `detectFormat`.
 */
export class AyalaCinemaScraper extends BaseScraper {
  readonly source = 'ayala-cinemas';
  readonly chain: CinemaChain = 'Ayala';

  private readonly baseUrl = 'https://www.sureseats.com';

  async scrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();
    const dates = options.dates ?? this.defaultDates();

    result.cinemas = AYALA_BRANCHES.map((b) => ({
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

      for (const branch of AYALA_BRANCHES) {
        for (const date of dates) {
          try {
            await page.goto(`${this.baseUrl}/cinema/${branch.slug}?date=${date}`, {
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

    $('[data-movie], .movie-schedule, .movie-item').each((_, node) => {
      const el = $(node);
      const rawTitle = (el.find('.movie-title, h3, h2').first().text() || el.attr('data-movie') || '').trim();
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
          rating: el.find('.rating, .mtrcb').first().text().trim() || undefined,
          duration_mins: this.parseRuntime(el.find('.runtime, .duration').first().text()),
          category: 'Mainstream',
        });
      }

      el.find('.schedule-time, .showtime, [data-time]').each((__, slotNode) => {
        const slot = $(slotNode);
        const time = (slot.attr('data-time') || slot.text()).trim();
        if (!time) return;

        // Ayala puts "DOLBY ATMOS" / "A-LUXE" in a sibling badge, not the title.
        const badgeText = slot
          .closest('.cinema-block, .screen-block')
          .find('.badge, .experience, .format')
          .map((___, b) => $(b).text())
          .get()
          .join(' ');
        const screenName =
          slot.closest('.cinema-block, .screen-block').find('.cinema-name, .screen-name').first().text().trim() ||
          undefined;

        try {
          const showtime: ScrapedShowtime = {
            cinema_slug: cinemaSlug,
            movie_slug: movieSlug,
            screen_name: screenName,
            format: this.detectFormat(rawTitle, badgeText, screenName, slot.attr('data-format')),
            start_time: this.toManilaISO(date, time),
            booking_url: slot.attr('data-booking-url') ?? `${this.baseUrl}/cinema/${cinemaSlug}`,
            ticket_price: this.parsePrice(slot.attr('data-price')),
          };
          result.showtimes.push(showtime);
        } catch (err) {
          result.errors.push(`[${this.source}] ${(err as Error).message}`);
        }
      });
    });
  }

  private parseRuntime(text: string): number | undefined {
    if (!text) return undefined;
    const hours = text.match(/(\d+)\s*h/i);
    const mins = text.match(/(\d+)\s*m/i);
    if (hours) return Number(hours[1]) * 60 + (mins ? Number(mins[1]) : 0);
    const plain = text.match(/\d+/);
    return plain ? Number(plain[0]) : undefined;
  }

  private parsePrice(text?: string): number | undefined {
    if (!text) return undefined;
    const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
}

export const ayalaCinemaScraper = new AyalaCinemaScraper();
