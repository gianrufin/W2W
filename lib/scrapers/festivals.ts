import type { VenueRecord } from './venues';

/**
 * Philippine film festival registry.
 *
 * Festivals are the tier no aggregator covers, and they are also the hardest to
 * scrape: each edition gets a new microsite, the schedule is often a JPEG or a
 * Facebook post, and the whole thing disappears when the run ends. So the
 * editions themselves are recorded here from published sources, and the
 * scrapers use this to know *where and when* to look rather than discovering it.
 *
 * Everything below is sourced, and `verified` records how far that source goes.
 * A festival that is `dates-only` has confirmed dates and venues but no
 * per-film schedule — the app should say a festival is running without
 * inventing screening times for it.
 */

export type FestivalVerification =
  /** Dates, venues and the film list are all confirmed. */
  | 'lineup'
  /** Dates and venues confirmed; per-film schedule not published yet. */
  | 'dates-only'
  /** Next edition not yet announced; last known pattern recorded. */
  | 'unannounced';

export interface FestivalEdition {
  /** Stable key used as `movies.festival_name`. */
  name: string;
  organiser: string;
  /** Manila-local ISO dates, inclusive. Null when unannounced. */
  startDate: string | null;
  endDate: string | null;
  /** Venue slugs from the registry in ./venues. */
  venueSlugs: string[];
  /** Where the schedule is published, when it is. */
  scheduleUrl?: string;
  ticketUrl?: string;
  verified: FestivalVerification;
  /** Provenance — kept so a stale entry can be re-checked against its source. */
  sources: string[];
  notes?: string;
}

export const FESTIVALS: FestivalEdition[] = [
  {
    name: 'Cinemalaya 2026',
    organiser: 'Cultural Center of the Philippines',
    startDate: '2026-08-06',
    endDate: '2026-08-18',
    // The 22nd edition is NOT at the CCP main building — it runs out of Shang
    // Red Carpet as the primary venue, with Ayala Malls and Gateway as
    // partners. CCP returns as a venue in 2027.
    venueSlugs: ['red-carpet-shangri-la', 'gateway-cineplex', 'trinoma'],
    scheduleUrl: 'https://www.cinemalaya.org',
    verified: 'lineup',
    sources: [
      'https://philstarlife.com/news-and-views/321414-list-cinemalaya-2026-films',
      'https://bworldonline.com/arts-and-leisure/2026/07/10/762307/cinemalaya-2026-ramps-up-ahead-of-return-to-ccp-next-year/',
      'https://en.wikipedia.org/wiki/2026_Cinemalaya',
    ],
    notes:
      '22nd edition, theme "Reel Reflections". Full-length finalists screen Aug 7–16; ' +
      'the 38th Gawad CCP Para sa Alternatibong Pelikula at Video runs alongside, Aug 7–16.',
  },
  {
    name: 'QCinema 2026',
    organiser: 'Quezon City Film Development Commission',
    // Typically October/November; the 2026 edition was not announced at the
    // time of writing, so no dates are asserted.
    startDate: null,
    endDate: null,
    // 2025 venue set, recorded as the expected footprint rather than a claim
    // about 2026.
    venueSlugs: [
      'gateway-cineplex',
      'trinoma',
      'robinsons-galleria',
      'fisher-mall-quezon-ave',
    ],
    scheduleUrl: 'https://qcinema.ph',
    verified: 'unannounced',
    sources: [
      'https://qcinema.ph/',
      'https://en.wikipedia.org/wiki/2025_QCinema_International_Film_Festival',
    ],
    notes:
      'The 2025 edition ran Nov 14–23 across six cinemas including Eastwood and ' +
      'Ayala Cloverleaf, which are not yet in the venue registry.',
  },
];

/** Films confirmed in a festival lineup, for editions where it is published. */
export interface FestivalFilm {
  festival: string;
  title: string;
  director: string;
  section: 'Full-Length Competition' | 'Short Film Competition' | 'Opening' | 'Closing';
}

/**
 * Cinemalaya 2026 lineup.
 *
 * Recorded because the festival opens on 6 August and its own site publishes
 * the schedule as prose rather than anything parseable. Titles here let the
 * scraper match screenings it finds, and let the app show the lineup even
 * before showtimes are known.
 */
export const CINEMALAYA_2026_FILMS: FestivalFilm[] = [
  { festival: 'Cinemalaya 2026', title: 'Enjoy Your Stay', director: 'Dominik Locher', section: 'Opening' },
  { festival: 'Cinemalaya 2026', title: 'Filipiñana', director: 'Rafael Manuel', section: 'Closing' },

  { festival: 'Cinemalaya 2026', title: 'a.ni.mal', director: 'Dustin Celestino', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: '2 Valid IDs', director: 'Ma-an Asuncion-Dagñalan and Abet Pagdagdagan Raz', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Dangeom', director: 'Paul Sta. Ana', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Ganggang', director: 'JL Burgos', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Kamay ni Bathala', director: 'Mark Duane Angos', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Mag-iina', director: 'Giancarlo Abrahan and Guelan Varela-Luarca', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'May Buntol ang mga Yan', director: 'Alpha Habon', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Status Rejected', director: 'Vahn Leinard Pascual', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Tayo Lang ang Nakakaalam', director: 'David Corpuz', section: 'Full-Length Competition' },
  { festival: 'Cinemalaya 2026', title: 'Tirik', director: 'May-i Guia Padilla', section: 'Full-Length Competition' },

  { festival: 'Cinemalaya 2026', title: 'Elenita Elene Elaine', director: 'Gabriela Serrano', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Honey, My Love, So Sweet', director: 'JT Trinidad', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Hoy, Hoy, Ingat!', director: 'Norvin de los Santos', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Kung Paano Kakalas', director: 'Joseph Vitali', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Para-paraan', director: 'Mae Chan Li', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Runo!', director: 'Lysa Catolico and Jazmine Gin Pateña', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Silkscreen', director: 'Rey Anthony Villaverde', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'Sorbetes', director: 'Jennissie Gilbuena', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'The Keeper', director: 'Nolan Rae Fabular and TRNZ', section: 'Short Film Competition' },
  { festival: 'Cinemalaya 2026', title: 'The River Flows in Different Places', director: 'Lot-lot Hermosura', section: 'Short Film Competition' },
];

/** Festivals whose run covers the given Manila date. */
export function activeFestivals(dateKey: string): FestivalEdition[] {
  return FESTIVALS.filter(
    (f) => f.startDate && f.endDate && dateKey >= f.startDate && dateKey <= f.endDate,
  );
}

/** Venue slugs a scraper should check while a festival is running. */
export function festivalVenueSlugs(dateKey: string): string[] {
  return [...new Set(activeFestivals(dateKey).flatMap((f) => f.venueSlugs))];
}

/** Guard against a festival pointing at a venue the registry does not have. */
export function validateFestivalVenues(venues: VenueRecord[]): string[] {
  const known = new Set(venues.map((v) => v.slug));
  const problems: string[] = [];
  for (const festival of FESTIVALS) {
    for (const slug of festival.venueSlugs) {
      if (!known.has(slug)) problems.push(`${festival.name}: unknown venue "${slug}"`);
    }
  }
  return problems;
}
