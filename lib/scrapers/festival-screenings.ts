import {
  BaseScraper,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapedShowtime,
} from './base-scraper';
import type { CinemaChain } from '@/types';
import { INDIE_VENUES } from './venues';
import { CINEMALAYA_2026_FILMS, FESTIVALS } from './festivals';

/**
 * Hand-entered festival screenings.
 *
 * Festival schedules are published as prose, JPEGs and Facebook posts, and the
 * microsite is rebuilt every edition — there is nothing stable to parse. So
 * confirmed screenings are entered here by hand from named sources.
 *
 * The rule this file exists to enforce: **only screenings with a published date,
 * time and venue go in.** As of writing, Cinemalaya 2026 has announced its full
 * 22-title lineup and its run (6–18 August) but only two per-film showtimes —
 * the opening and the closing. The other twenty films are real and are in the
 * registry, but they get no showtime rows, because a plausible-looking time
 * would send someone to Shangri-La for a screening that is not happening.
 *
 * When the festival publishes the grid, add the rows here.
 */

interface ConfirmedScreening {
  festival: string;
  title: string;
  /** Manila-local date and wall-clock time, exactly as published. */
  date: string;
  time: string;
  cinemaSlug: string;
  screenName: string;
  /** Null when the published source does not state a price. 0 means free. */
  price: number | null;
  bookingUrl?: string;
  source: string;
  note?: string;
}

const CONFIRMED: ConfirmedScreening[] = [
  {
    festival: 'Cinemalaya 2026',
    title: 'Enjoy Your Stay',
    date: '2026-08-06',
    time: '7:30 PM',
    cinemaSlug: 'red-carpet-shangri-la',
    screenName: 'Red Carpet Cinemas 1 & 2',
    price: 0,
    source: 'https://www.wazzup.ph/cinemalaya-2026-schedule-tickets/',
    note: 'Opening film. Free admission, first-come first-served; tickets released two hours before.',
  },
  {
    festival: 'Cinemalaya 2026',
    title: 'Filipiñana',
    date: '2026-08-16',
    time: '8:30 PM',
    cinemaSlug: 'red-carpet-shangri-la',
    screenName: 'Red Carpet Cinemas 1 & 2',
    price: 350,
    bookingUrl: 'https://www.ticketnet.com.ph/event-detail/CINEMALAYA-2026',
    source: 'https://www.wazzup.ph/cinemalaya-2026-schedule-tickets/',
    note: 'Closing film. ₱350 regular, ₱250 student.',
  },
];

export class FestivalScreeningsScraper extends BaseScraper {
  readonly source = 'festivals-manual';
  readonly chain: CinemaChain = 'FestivalVenue';

  // Nothing is fetched — this source is the hand-entered record. It still
  // implements the scraper interface so the pipeline ingests it identically.
  async scrape(_options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const result = this.emptyResult();

    // Venues a running festival uses, so the pins exist even before showtimes do.
    const festivalVenueSlugs = new Set(FESTIVALS.flatMap((f) => f.venueSlugs));
    result.cinemas = INDIE_VENUES.filter((v) => festivalVenueSlugs.has(v.slug)).map((v) => ({
      name: v.name,
      slug: v.slug,
      chain: v.chain,
      lat: v.lat,
      lng: v.lng,
      address: v.address,
      city: v.city,
    }));

    // Every announced title, so search and the festival filter know they exist.
    for (const film of CINEMALAYA_2026_FILMS) {
      result.movies.push({
        title: film.title,
        slug: this.slugify(`${film.title}-${film.festival}`),
        normalized_title: this.normalizeMovieTitle(film.title),
        synopsis: `${film.section} — directed by ${film.director}.`,
        category: film.section === 'Short Film Competition' ? 'Indie' : 'Festival',
        festival_name: film.festival,
      });
    }

    for (const screening of CONFIRMED) {
      const film = CINEMALAYA_2026_FILMS.find((f) => f.title === screening.title);
      if (!film) {
        result.errors.push(`[${this.source}] "${screening.title}" is not in the lineup registry`);
        continue;
      }

      try {
        const showtime: ScrapedShowtime = {
          cinema_slug: screening.cinemaSlug,
          movie_slug: this.slugify(`${film.title}-${film.festival}`),
          screen_name: screening.screenName,
          format: '2D',
          start_time: this.toManilaISO(screening.date, screening.time),
          booking_url: screening.bookingUrl,
          ticket_price: screening.price ?? undefined,
        };
        result.showtimes.push(showtime);
      } catch (err) {
        result.errors.push(`[${this.source}] ${screening.title}: ${(err as Error).message}`);
      }
    }

    // Stated plainly in the run output so the gap is visible rather than
    // looking like a scrape that quietly found little.
    const withTimes = new Set(CONFIRMED.map((c) => c.title));
    const missing = CINEMALAYA_2026_FILMS.filter((f) => !withTimes.has(f.title)).length;
    if (missing) {
      result.errors.push(
        `[${this.source}] ${missing} Cinemalaya 2026 titles have no published showtime yet — ` +
          'lineup recorded, screenings intentionally omitted until the grid is released.',
      );
    }

    return result;
  }
}

export const festivalScreeningsScraper = new FestivalScreeningsScraper();
