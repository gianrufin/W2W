import * as cheerio from 'cheerio';
import { FestivalAdapter } from '../adapter';
import { httpText } from '@/lib/scrapers/http';
import type { FestivalScrapeOptions, FestivalScrapeResult } from '../types';

/**
 * QCinema International Film Festival.
 *
 * The schedule page is a WordPress page built with Themify, rendered
 * server-side, and structurally very clean once you see it: heading levels
 * carry the hierarchy and the paragraphs carry the screenings.
 *
 *   <h2>11/15 Saturday</h2>          ← the date
 *   <h3>GATEWAY 11</h3>              ← the venue (really a screen)
 *   <p>6:00p [GALA + TALKBACK]<br>Diamonds in the Sand</p>
 *
 * So the parser is a state machine over the headings and paragraphs in document
 * order, carrying the current date and venue forward. No CSS-class selectors:
 * Themify's class names are generated per block (`tb_j2fc523`) and change on
 * every edit, so anything keyed to them would break the first time the
 * programme is updated.
 *
 * Dates print as "11/15" with no year — see `resolveYear`.
 */

const SCHEDULE_URL = 'https://qcinema.ph/schedule/';
const FESTIVAL_SLUG = 'qcinema';

export class QCinemaAdapter extends FestivalAdapter {
  readonly source = 'qcinema';
  readonly label = 'QCinema International Film Festival';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    let html: string;
    try {
      html = await httpText(SCHEDULE_URL);
    } catch (err) {
      result.errors.push(`[${this.source}] schedule page: ${(err as Error).message}`);
      return result;
    }

    const $ = cheerio.load(html);
    const dates = new Set<string>();

    let currentDate: string | null = null;
    let currentVenue: string | null = null;

    // Only the builder's own text blocks, so the site chrome (menus, footers)
    // cannot inject a heading that resets the state machine.
    for (const node of $('.tb_text_wrap').find('h2, h3, p').toArray()) {
      const el = $(node);
      const tag = (node as { tagName?: string }).tagName?.toLowerCase();
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (!text) continue;

      if (tag === 'h2') {
        const parsed = this.parseDateHeading(text);
        if (parsed) {
          currentDate = parsed;
          dates.add(parsed);
          // A new day restarts the venue grouping.
          currentVenue = null;
        }
        continue;
      }

      if (tag === 'h3') {
        currentVenue = text;
        continue;
      }

      if (!currentDate || !currentVenue) continue;

      // The <br> between time and title is the only separator, so read the raw
      // HTML rather than the flattened text.
      const [timePart, ...titleParts] = el
        .html()
        ?.split(/<br\s*\/?>/i)
        .map((part) => cheerio.load(`<div>${part}</div>`)('div').text().replace(/\s+/g, ' ').trim())
        .filter(Boolean) ?? [];

      if (!timePart || !titleParts.length) continue;

      // "6:00p [GALA + TALKBACK]" — the clock, then the tags.
      const timeMatch = /^(\d{1,2}(?::\d{2})?\s*[apAP]?m?)/.exec(timePart);
      if (!timeMatch) continue;

      const tagText = timePart.slice(timeMatch[0].length);
      const { title, section, talkback, inviteOnly } = this.parseProgrammeTags(
        `${tagText} ${titleParts.join(' ')}`,
      );
      if (!title) continue;

      try {
        result.events.push({
          festival_slug: FESTIVAL_SLUG,
          edition_year: Number(currentDate.slice(0, 4)),
          film_title: title,
          section,
          venue_name: currentVenue,
          showtime: this.toManilaISO(currentDate, timeMatch[1]),
          talkback_flag: talkback,
          admission: inviteOnly ? 'By invitation' : undefined,
          // Every QCinema screening is ticketed through the festival's own
          // badge and box office, not a per-film URL.
          ticket_url: 'https://qcinema.ph/festival-badge/',
          ticket_portal: 'qcinema-box-office',
        });
      } catch (err) {
        result.errors.push(`[${this.source}] ${title}: ${(err as Error).message}`);
      }
    }

    if (dates.size) {
      const sorted = [...dates].sort();
      result.editions.push({
        slug: FESTIVAL_SLUG,
        name: `QCinema ${sorted[0].slice(0, 4)}`,
        edition_year: Number(sorted[0].slice(0, 4)),
        cadence: 'annual',
        screening_start_date: sorted[0],
        screening_end_date: sorted[sorted.length - 1],
        official_url: 'https://qcinema.ph',
        ticket_url: 'https://qcinema.ph/festival-badge/',
      });
    } else {
      result.errors.push(
        `[${this.source}] no dated screenings found — the schedule page is up but ` +
          'its structure has changed, or this edition has not been published yet',
      );
    }

    return result;
  }

  /** "11/15 Saturday" → "2025-11-15". */
  private parseDateHeading(text: string): string | null {
    const match = /^(\d{1,2})\/(\d{1,2})\b/.exec(text.trim());
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const year = this.resolveYear(month, day);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * QCinema prints no year, and it runs in November — close enough to the year
   * boundary that "assume the current year" is wrong for anyone loading the
   * page in January. The year whose date lands nearest to today wins.
   */
  private resolveYear(month: number, day: number): number {
    const today = new Date(Date.now() + 8 * 3_600_000);
    const thisYear = today.getUTCFullYear();
    const reference = Date.UTC(thisYear, today.getUTCMonth(), today.getUTCDate());

    return [thisYear - 1, thisYear, thisYear + 1]
      .map((year) => ({ year, delta: Math.abs(Date.UTC(year, month - 1, day) - reference) }))
      .sort((a, b) => a.delta - b.delta)[0].year;
  }
}

export const qcinemaAdapter = new QCinemaAdapter();
