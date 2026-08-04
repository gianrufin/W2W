import type {
  FestivalScrapeOptions,
  FestivalScrapeResult,
  FestivalSection,
} from './types';

/**
 * Base class for a festival adapter.
 *
 * Every source here publishes its programme differently — an HTML grid, a JSON
 * blob inside a `<script>`, a WordPress REST endpoint, a ticketing page — and
 * none of them will still be shaped that way in two years. The adapter boundary
 * is the point of the design: `fetch()` is whatever that site needs this
 * season, and everything downstream sees the same `FestivalEvent`.
 *
 * Adapters do three things and no more:
 *   1. read their source,
 *   2. emit `FestivalEvent`s with the venue named the way the festival names it,
 *   3. say what went wrong.
 *
 * They never resolve venues, never write to the database, and never decide
 * whether a festival is active. Those are shared concerns and live once, in
 * `venue-map.ts` and `pipeline.ts`.
 */
export abstract class FestivalAdapter {
  /** Stable id, written to `festivals.source` and `showtimes.source`. */
  abstract readonly source: string;
  /** For the run log — which organisation this covers. */
  abstract readonly label: string;

  abstract fetch(options?: FestivalScrapeOptions): Promise<FestivalScrapeResult>;

  protected emptyResult(): FestivalScrapeResult {
    return { source: this.source, editions: [], events: [], errors: [], unmappedVenues: [] };
  }

  /**
   * Read the programme tags festivals bracket into their titles.
   *
   * QCinema writes "[GALA + TALKBACK] Diamonds in the Sand"; the tag carries
   * two separate facts and the title carries neither. Everything in brackets is
   * consumed, and the clean title is what the user sees.
   */
  protected parseProgrammeTags(raw: string): {
    title: string;
    section?: FestivalSection;
    talkback: boolean;
    inviteOnly: boolean;
  } {
    const tags: string[] = [];
    const title = raw
      .replace(/\[([^\]]+)\]/g, (_, tag: string) => {
        tags.push(tag.toUpperCase());
        return ' ';
      })
      .replace(/\s{2,}/g, ' ')
      .trim();

    const joined = tags.join(' ');

    return {
      title,
      section: sectionFrom(joined, title),
      talkback: /TALK\s*BACK|\bQ\s*&\s*A\b/.test(joined),
      inviteOnly: /BY\s*INVITATION|INVITE\s*ONLY|PRESS\s*SCREENING/.test(joined),
    };
  }

  /**
   * Build an ISO timestamp in Philippine time from a date and a printed time.
   *
   * Accepts the several ways festivals write a clock: "6:00p" (QCinema's
   * compact form), "6:00 PM", "18:00". A time that parses as none of them
   * throws rather than defaulting — a screening silently placed at midnight is
   * worse than a screening reported as unparseable.
   */
  protected toManilaISO(date: string, time: string): string {
    const text = time.trim().toLowerCase().replace(/\./g, '');

    const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(text);
    if (!match) throw new Error(`Unparseable showtime "${time}" for ${date}`);

    let hour = Number(match[1]);
    const minute = match[2] ?? '00';
    const meridiem = match[3]?.[0];

    if (meridiem === 'p' && hour !== 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
    if (hour > 23) throw new Error(`Impossible hour in "${time}" for ${date}`);

    return `${date}T${String(hour).padStart(2, '0')}:${minute}:00+08:00`;
  }

  /** yyyy-MM-dd for today in Manila — the runner is on UTC and rolls early. */
  protected manilaToday(): string {
    return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  }

  protected slugify(raw: string): string {
    return (raw ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

/** Match a section from the bracketed tags, falling back to the title's shape. */
function sectionFrom(tags: string, title: string): FestivalSection | undefined {
  if (/\bGALA\b|OPENING\s*FILM|CLOSING\s*FILM/.test(tags)) return 'Gala';
  if (/RETROSPECTIVE|RESTORED|CLASSIC/.test(tags)) return 'Retrospective';
  if (/MASTERCLASS|WORKSHOP|LECTURE/.test(tags)) return 'Masterclass';
  if (/COMPETITION|IN\s*COMPETITION/.test(tags)) return 'Competition';
  if (/SPECIAL\s*SCREENING|BY\s*INVITATION/.test(tags)) return 'Special Screening';
  // A shorts *programme* is a screening in its own right, and festivals signal
  // it in the title far more often than in a tag.
  if (/\bSHORTS?\b|SHORT\s*FILM|PROGRAM(ME)?\s*\d/i.test(`${tags} ${title}`)) return 'Shorts';
  if (/\bTALK\s*BACK\b/.test(tags)) return 'Talkback';
  return undefined;
}
