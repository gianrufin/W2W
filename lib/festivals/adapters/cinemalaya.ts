import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';
import { FestivalAdapter } from '../adapter';
import { BROWSER_UA } from '@/lib/scrapers/http';
import type { FestivalScrapeOptions, FestivalScrapeResult } from '../types';

/**
 * Cinemalaya Independent Film Festival — the official site.
 *
 * `cinemalaya.org` answers 403 to plain HTTP: it is behind Cloudflare's bot
 * wall, and no combination of headers gets past it because the check is on the
 * TLS handshake, not the request. A real browser is the only way in, which
 * makes this the one adapter in the module that needs Playwright and the one
 * that cannot run anywhere without a Chromium binary.
 *
 * It is also, deliberately, the *least* important source for Cinemalaya. The
 * festival has never published a machine-readable per-film grid, so the
 * screenings that actually reach the map come from TicketNet, which sells them.
 * What this adds is the lineup and the official window — the programme, not the
 * schedule.
 *
 * A failure here is therefore not a failure of Cinemalaya coverage. It is
 * reported and the run continues.
 */

const SITE = 'https://www.cinemalaya.org';
const FESTIVAL_SLUG = 'cinemalaya';

export class CinemalayaAdapter extends FestivalAdapter {
  readonly source = 'cinemalaya';
  readonly label = 'Cinemalaya Independent Film Festival';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    let html: string;
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-PH' });
      const page = await context.newPage();
      await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      // Cloudflare's interstitial resolves itself; give it a moment.
      await page.waitForTimeout(2_500);
      html = await page.content();
    } catch (err) {
      result.errors.push(
        `[${this.source}] ${(err as Error).message} — the official site is ` +
          'unreachable; Cinemalaya screenings still arrive via TicketNet',
      );
      return result;
    } finally {
      await browser?.close();
    }

    const $ = cheerio.load(html);
    const text = $('body').text().replace(/\s+/g, ' ');

    // The edition number and year appear in the masthead every year, in a form
    // that has survived several site redesigns: "Cinemalaya 22 ... 2026".
    const edition = /cinemalaya\s+(\d{1,2})\b/i.exec(text);
    const year = /\b(20\d{2})\b/.exec(text);
    if (!year) {
      result.errors.push(
        `[${this.source}] loaded the site but found no edition year in the page`,
      );
      return result;
    }

    const window = this.parseWindow(text, Number(year[1]));

    result.editions.push({
      slug: FESTIVAL_SLUG,
      name: edition ? `Cinemalaya ${edition[1]}` : `Cinemalaya ${year[1]}`,
      edition_year: Number(year[1]),
      cadence: 'annual',
      screening_start_date: window?.start ?? null,
      screening_end_date: window?.end ?? null,
      official_url: SITE,
    });

    return result;
  }

  /** "August 6 - 18, 2026" and its several cousins. */
  private parseWindow(text: string, year: number): { start: string; end: string } | null {
    const months =
      'january|february|march|april|may|june|july|august|september|october|november|december';

    const sameMonth = new RegExp(`(${months})\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})`, 'i').exec(text);
    if (sameMonth) {
      const m = monthIndex(sameMonth[1]);
      return {
        start: iso(year, m, sameMonth[2]),
        end: iso(year, m, sameMonth[3]),
      };
    }

    const crossMonth = new RegExp(
      `(${months})\\s+(\\d{1,2})\\s*[-–]\\s*(${months})\\s+(\\d{1,2})`,
      'i',
    ).exec(text);
    if (crossMonth) {
      return {
        start: iso(year, monthIndex(crossMonth[1]), crossMonth[2]),
        end: iso(year, monthIndex(crossMonth[3]), crossMonth[4]),
      };
    }

    return null;
  }
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase()) + 1;
}

function iso(year: number, month: number, day: string): string {
  return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export const cinemalayaAdapter = new CinemalayaAdapter();
