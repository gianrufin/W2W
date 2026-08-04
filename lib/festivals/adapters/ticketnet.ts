import * as cheerio from 'cheerio';
import { FestivalAdapter } from '../adapter';
import { httpText, mapWithConcurrency } from '@/lib/scrapers/http';
import type { FestivalScrapeOptions, FestivalScrapeResult } from '../types';

/**
 * TicketNet — festival runs at Araneta City's Gateway Cineplex.
 *
 * TicketNet is where several Philippine festivals actually sell tickets, and it
 * is the only source that carries Cinemalaya's commercial run at all: the
 * festival's own site sits behind Cloudflare and has never published a per-film
 * grid.
 *
 * The chain scraper (`lib/scrapers/ticketnet.ts`) already reads this site for
 * ordinary releases, and deliberately handles only single-date events. Festival
 * runs are written as **ranges** —
 *
 *   CINEMALAYA 2026 SHORTS SET A: August 7 - August 18, 2026 | 09:00 PM
 *     CINEMA 16 - 12:00 PM | 3:00 PM | 6:00 PM
 *     CINEMA 12 - 12:00 PM | 3:00 PM | 6:00 PM
 *
 * — meaning the same programme repeats daily across twelve days on four
 * screens. Expanding that is this adapter's whole reason to exist, and it is
 * why the two live side by side rather than one growing a mode flag.
 */

const BASE = 'https://www.ticketnet.com.ph';
const LISTING = '/gateway-cineplex-18-movies';
const VENUE = 'Gateway Cineplex 18';

/** Festival titles TicketNet sells, mapped to our stable slugs. */
const FESTIVALS: ReadonlyArray<{ pattern: RegExp; slug: string; name: string }> = [
  { pattern: /\bcinemalaya\b/i, slug: 'cinemalaya', name: 'Cinemalaya' },
  { pattern: /\bqcinema\b/i, slug: 'qcinema', name: 'QCinema' },
  { pattern: /\bcinema\s*one\b/i, slug: 'cinema-one-originals', name: 'Cinema One Originals' },
  { pattern: /\bsinag\s*maynila\b/i, slug: 'sinag-maynila', name: 'Sinag Maynila' },
  { pattern: /\bmmff\b|metro\s*manila\s*film\s*festival/i, slug: 'mmff', name: 'MMFF' },
  { pattern: /\beiga\s*sai\b/i, slug: 'eiga-sai', name: 'Eiga Sai' },
];

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export class TicketNetFestivalAdapter extends FestivalAdapter {
  readonly source = 'ticketnet-festivals';
  readonly label = 'TicketNet — Araneta City festival runs';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    let paths: string[];
    try {
      const html = await httpText(`${BASE}${LISTING}`);
      const $ = cheerio.load(html);
      paths = [
        ...new Set(
          $('a[href*="/event-detail/"]')
            .toArray()
            .map((node) => $(node).attr('href'))
            .filter((href): href is string => Boolean(href))
            .map((href) => new URL(href, BASE).pathname),
        ),
      ];
    } catch (err) {
      result.errors.push(`[${this.source}] listing: ${(err as Error).message}`);
      return result;
    }

    const windows = new Map<string, { start: string; end: string; name: string }>();

    await mapWithConcurrency(paths, options.maxConcurrency ?? 3, async (path) => {
      try {
        this.parseEvent(await httpText(`${BASE}${path}`), result, windows);
      } catch (err) {
        result.errors.push(`[${this.source}] ${path}: ${(err as Error).message}`);
      }
    });

    for (const [slug, window] of windows) {
      result.editions.push({
        slug,
        name: `${window.name} ${window.start.slice(0, 4)}`,
        edition_year: Number(window.start.slice(0, 4)),
        cadence: 'annual',
        screening_start_date: window.start,
        screening_end_date: window.end,
        ticket_url: `${BASE}${LISTING}`,
      });
    }

    if (!result.events.length) {
      // Entirely normal outside festival season — stated, not treated as a fault.
      result.errors.push(
        `[${this.source}] no festival runs on sale at ${VENUE} right now ` +
          `(${paths.length} events checked)`,
      );
    }

    return result;
  }

  private parseEvent(
    html: string,
    result: FestivalScrapeResult,
    windows: Map<string, { start: string; end: string; name: string }>,
  ): void {
    const $ = cheerio.load(html);

    for (const row of $('tr').toArray()) {
      const el = $(row);
      const anchor = el.find('a.ticketlist').first();
      const heading = anchor.text().replace(/\s+/g, ' ').trim();
      if (!heading) continue;

      const festival = FESTIVALS.find((f) => f.pattern.test(heading));
      // Ordinary releases belong to the chain scraper, which links them better.
      if (!festival) continue;

      const range = this.parseDateRange(heading);
      if (!range) {
        result.errors.push(`[${this.source}] unreadable date in "${heading}"`);
        continue;
      }

      const rawTitle = heading.split(/[:|]/)[0].trim();
      const { title, section, talkback, inviteOnly } = this.parseProgrammeTags(rawTitle);
      if (!title) continue;

      const ticketUrl = anchor.attr('href') || el.find('a.btn').first().attr('href') || undefined;

      const window = windows.get(festival.slug);
      windows.set(festival.slug, {
        name: festival.name,
        start: window && window.start < range.start ? window.start : range.start,
        end: window && window.end > range.end ? window.end : range.end,
      });

      // Each <li> is one screen and its times: "CINEMA 16 - 12:00 PM | 3:00 PM".
      for (const line of el.find('.eventscheduledetail li').toArray()) {
        const text = $(line).text().replace(/\s+/g, ' ').trim();
        if (!text || /^schedule:?$/i.test(text)) continue;

        const [screenPart, ...timeParts] = text.split(/\s+-\s+/);
        const screen = timeParts.length ? screenPart.trim() : undefined;
        const times = (timeParts.length ? timeParts.join(' - ') : text)
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean);

        for (const date of eachDay(range.start, range.end)) {
          for (const time of times) {
            try {
              result.events.push({
                festival_slug: festival.slug,
                edition_year: Number(date.slice(0, 4)),
                film_title: title,
                section: section ?? 'Shorts',
                venue_name: VENUE,
                screen_name: screen,
                showtime: this.toManilaISO(date, time),
                talkback_flag: talkback,
                admission: inviteOnly ? 'By invitation' : undefined,
                ticket_url: ticketUrl,
                // etix is the real box office here, so these screenings get a
                // link that lands on a seat map rather than a listing page.
                ticket_portal: 'etix',
              });
            } catch (err) {
              result.errors.push(`[${this.source}] ${title}: ${(err as Error).message}`);
            }
          }
        }
      }
    }
  }

  /**
   * Read either form TicketNet writes after the title:
   *
   *   "August 7 - August 18, 2026"   → a run
   *   "August 05, 2026"              → a single date
   *
   * The year appears only at the end, so the opening month carries it too.
   */
  private parseDateRange(heading: string): { start: string; end: string } | null {
    const run =
      /([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(heading);
    if (run) {
      const start = toIso(run[1], run[2], run[5]);
      const end = toIso(run[3], run[4], run[5]);
      return start && end ? { start, end } : null;
    }

    const single = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(heading);
    if (single) {
      const date = toIso(single[1], single[2], single[3]);
      return date ? { start: date, end: date } : null;
    }

    return null;
  }
}

function toIso(month: string, day: string, year: string): string | null {
  const index = MONTHS.indexOf(month.toLowerCase());
  if (index < 0) return null;
  return `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Inclusive date range, capped so a malformed year cannot spin forever. */
function eachDay(start: string, end: string, limit = 60): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
    if (days.length >= limit) break;
  }
  return days;
}

export const ticketNetFestivalAdapter = new TicketNetFestivalAdapter();
