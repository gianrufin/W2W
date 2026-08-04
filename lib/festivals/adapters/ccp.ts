import { FestivalAdapter } from '../adapter';
import { httpJson } from '@/lib/scrapers/http';
import type { FestivalScrapeOptions, FestivalScrapeResult } from '../types';

/**
 * Cultural Center of the Philippines.
 *
 * The CCP runs WordPress with The Events Calendar, whose REST API is public and
 * unauthenticated. That makes this the least fragile adapter in the module —
 * it reads a documented plugin API rather than a theme's markup.
 *
 * What it is *not* is a schedule. The CCP publishes an event ("CINEMALAYA 22
 * PHILIPPINE INDEPENDENT FILM FESTIVAL 2026", 6–16 August) rather than a
 * per-film grid. So this adapter's job is to establish **editions and their
 * date windows** — which is exactly what the lifecycle needs and what nothing
 * else reliably provides — and to emit screenings only where a single-film
 * event genuinely names a time.
 *
 * Festival dates arriving from here are what let Cinemalaya's `is_active` flip
 * correctly even in the years its own site is behind Cloudflare.
 */

const API = 'https://culturalcenter.gov.ph/wp-json/tribe/events/v1/events';

/** Categories that mean "this is cinema", not a ballet or a book launch. */
const FILM_CATEGORIES = /festival|film|cinema|screening/i;

/** Festival names the CCP hosts, mapped to our stable slugs. */
const KNOWN_FESTIVALS: ReadonlyArray<{ pattern: RegExp; slug: string; name: string }> = [
  { pattern: /cinemalaya/i, slug: 'cinemalaya', name: 'Cinemalaya' },
  { pattern: /cinema\s*one/i, slug: 'cinema-one-originals', name: 'Cinema One Originals' },
  { pattern: /sinag\s*maynila/i, slug: 'sinag-maynila', name: 'Sinag Maynila' },
];

interface TribeEvent {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  url?: string;
  website?: string;
  image?: { url?: string } | false;
  venue?: { venue?: string } | null;
  categories?: Array<{ name?: string; slug?: string }>;
}

export class CcpAdapter extends FestivalAdapter {
  readonly source = 'ccp';
  readonly label = 'Cultural Center of the Philippines';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    const result = this.emptyResult();
    if (options.dryRun) return result;

    let events: TribeEvent[];
    try {
      const body = await httpJson<{ events?: TribeEvent[] }>(`${API}?per_page=50`);
      events = body.events ?? [];
    } catch (err) {
      result.errors.push(`[${this.source}] events API: ${(err as Error).message}`);
      return result;
    }

    for (const event of events) {
      const title = event.title?.trim();
      if (!title) continue;

      const categories = (event.categories ?? []).map((c) => c.name ?? '').join(' ');
      const known = KNOWN_FESTIVALS.find((f) => f.pattern.test(title));
      // Either it is a festival we track, or the CCP filed it under film.
      if (!known && !FILM_CATEGORIES.test(categories)) continue;

      const start = (event.start_date ?? '').slice(0, 10);
      const end = (event.end_date ?? '').slice(0, 10) || start;
      if (!start) continue;

      const year = Number(start.slice(0, 4));

      result.editions.push({
        slug: known?.slug ?? this.slugify(title),
        name: known ? `${known.name} ${year}` : title,
        edition_year: year,
        cadence: 'annual',
        screening_start_date: start,
        screening_end_date: end,
        official_url: event.website || event.url,
      });

      // A multi-day festival's start timestamp is the window opening, not a
      // screening. Emitting it as one would put a fictional show on the map.
      if (start !== end) continue;

      const time = (event.start_date ?? '').slice(11, 16);
      if (!time || time === '00:00') continue;

      try {
        result.events.push({
          festival_slug: known?.slug ?? this.slugify(title),
          edition_year: year,
          film_title: this.parseProgrammeTags(title).title,
          section: 'Special Screening',
          venue_name: event.venue?.venue || 'Cultural Center of the Philippines',
          showtime: this.toManilaISO(start, time),
          poster_url: typeof event.image === 'object' ? event.image?.url : undefined,
          ticket_url: event.website || event.url,
          ticket_portal: 'venue-box-office',
        });
      } catch (err) {
        result.errors.push(`[${this.source}] ${title}: ${(err as Error).message}`);
      }
    }

    if (!result.editions.length) {
      result.errors.push(
        `[${this.source}] no film events in the CCP calendar right now ` +
          `(${events.length} events checked)`,
      );
    }

    return result;
  }
}

export const ccpAdapter = new CcpAdapter();
