import { FestivalAdapter } from '../adapter';
import { httpText } from '@/lib/scrapers/http';
import type { FestivalScrapeOptions, FestivalScrapeResult, FestivalSection } from '../types';

/**
 * FDCP Cinematheque Centres — Manila, Negros, Iloilo, Davao, Nabunturan.
 *
 * The page looks like a JavaScript app: pick a location, watch a spinner, get a
 * list. It is not. The whole schedule is inlined into the page as
 * `const CC_SCHEDULE = [...]`, and the "loading" is the browser filtering an
 * array it already has. So this is one request and a regex, with no browser and
 * no per-location round trips.
 *
 * Cinematheques are `continuous`, not annual: they programme year-round and
 * have no season to be outside of, so their screenings are never archived on a
 * festival-ended rule. See `refresh_festival_activity()`.
 *
 * Almost everything here is free admission, which is worth surfacing — it is
 * often the reason someone picks a cinematheque over a mall.
 */

const SHOWINGS_URL = 'https://fdcp.ph/cinematheque-showings';
const FESTIVAL_SLUG = 'fdcp-cinematheque';

interface ScheduleRow {
  dateISO?: string;
  location?: string;
  time?: string;
  film?: string;
  /** The season or strand: "Cinematheque Director Series". */
  program?: string;
  admission?: string;
}

export class FdcpCinemathequeAdapter extends FestivalAdapter {
  readonly source = 'fdcp-cinematheque';
  readonly label = 'FDCP Cinematheque Centres';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    let html: string;
    try {
      html = await httpText(SHOWINGS_URL);
    } catch (err) {
      result.errors.push(`[${this.source}] showings page: ${(err as Error).message}`);
      return result;
    }

    const match = /const\s+CC_SCHEDULE\s*=\s*(\[[\s\S]*?\]);/.exec(html);
    if (!match) {
      result.errors.push(
        `[${this.source}] CC_SCHEDULE not found — the page loaded but no longer ` +
          'inlines its schedule, so this adapter needs rewriting',
      );
      return result;
    }

    let rows: ScheduleRow[];
    try {
      rows = JSON.parse(match[1]) as ScheduleRow[];
    } catch (err) {
      result.errors.push(`[${this.source}] CC_SCHEDULE is not valid JSON: ${(err as Error).message}`);
      return result;
    }

    const today = this.manilaToday();
    const horizon = options.horizonDays ?? 120;
    const cutoff = new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10);

    const dates: string[] = [];

    for (const row of rows) {
      if (!row.dateISO || !row.time || !row.film || !row.location) continue;
      // Past programmes stay on the page long after they run.
      if (row.dateISO < today || row.dateISO > cutoff) continue;

      const { title, section, talkback } = this.parseProgrammeTags(row.film);
      if (!title) continue;

      try {
        result.events.push({
          festival_slug: FESTIVAL_SLUG,
          edition_year: Number(row.dateISO.slice(0, 4)),
          film_title: title,
          // The strand is the closest thing to a section the FDCP publishes,
          // and it is what tells a retrospective from a boot-camp showcase.
          section: section ?? sectionFromProgramme(row.program),
          venue_name: `Cinematheque ${row.location}`,
          showtime: this.toManilaISO(row.dateISO, row.time),
          talkback_flag: talkback,
          admission: row.admission || undefined,
          ticket_url: SHOWINGS_URL,
          ticket_portal: 'venue-box-office',
        });
        dates.push(row.dateISO);
      } catch (err) {
        result.errors.push(`[${this.source}] ${title}: ${(err as Error).message}`);
      }
    }

    if (dates.length) {
      dates.sort();
      result.editions.push({
        slug: FESTIVAL_SLUG,
        name: 'FDCP Cinematheque',
        edition_year: Number(dates[0].slice(0, 4)),
        // Never "over" — see the note at the top.
        cadence: 'continuous',
        screening_start_date: dates[0],
        screening_end_date: dates[dates.length - 1],
        official_url: SHOWINGS_URL,
      });
    } else {
      // Not an error: a cinematheque genuinely goes dark between programmes.
      result.errors.push(
        `[${this.source}] schedule parsed but holds no upcoming screenings ` +
          `(${rows.length} rows, all outside ${today}…${cutoff})`,
      );
    }

    return result;
  }
}

/** Map the FDCP's strand names onto our sections. */
function sectionFromProgramme(programme?: string): FestivalSection | undefined {
  if (!programme) return undefined;
  if (/director\s*series|retrospective|classics?/i.test(programme)) return 'Retrospective';
  if (/shorts?/i.test(programme)) return 'Shorts';
  return 'Special Screening';
}

export const fdcpCinemathequeAdapter = new FdcpCinemathequeAdapter();
