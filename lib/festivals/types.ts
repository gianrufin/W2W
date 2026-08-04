import type { ScreenFormat } from '@/types';

/**
 * Festival data model.
 *
 * Deliberately separate from `lib/scrapers`: the chain pipeline is live and
 * must not change shape because a festival needs a `talkback` flag. The two
 * services meet only in the database, through the additive columns added by
 * `004_festivals.sql`.
 *
 * The unit here is the **screening**, not the film. A festival title plays
 * three times across two venues, once with the director present and once
 * online, and each of those is a different decision for the person choosing.
 */

/** How often an edition comes round — drives the archiving rules. */
export type FestivalCadence = 'annual' | 'seasonal' | 'continuous';

/**
 * What kind of slot this is within the programme.
 *
 * Distinct from a film's category: a Gala and a regular screening can be the
 * same film, shown differently.
 */
export type FestivalSection =
  | 'Feature'
  | 'Shorts'
  | 'Gala'
  | 'Competition'
  | 'Retrospective'
  | 'Talkback'
  | 'Masterclass'
  | 'Special Screening';

/** One edition of one festival, or one continuous programmer. */
export interface FestivalEdition {
  /** Stable across editions: 'cinemalaya'. The year lives in `edition_year`. */
  slug: string;
  name: string;
  edition_year: number;
  cadence: FestivalCadence;
  /** Null until the organiser announces dates — which is normal for months. */
  screening_start_date?: string | null;
  screening_end_date?: string | null;
  official_url?: string;
  ticket_url?: string;
}

/**
 * One screening.
 *
 * `venue_name` is the festival's own spelling — "GATEWAY 11", "TriNoma 3",
 * "Cinematheque Manila" — and is resolved to a real cinema by `venue-map.ts`.
 * Adapters never guess at a venue id; carrying the raw string through is what
 * lets the mapping layer be corrected in one place.
 */
export interface FestivalEvent {
  festival_slug: string;
  edition_year: number;

  film_title: string;
  director?: string;
  country?: string;
  year_produced?: number;
  synopsis?: string;
  poster_url?: string;
  duration_mins?: number;
  rating?: string;

  section?: FestivalSection;

  /** As the festival writes it. Resolved downstream, never here. */
  venue_name: string;
  /** The auditorium, when the festival names one separately. */
  screen_name?: string;

  /** ISO-8601 with the Manila offset, exactly like a chain showtime. */
  showtime: string;
  format?: ScreenFormat;

  /** A Q&A or director's talkback follows this screening. */
  talkback_flag?: boolean;
  /** Streamed rather than projected — distance and directions are meaningless. */
  is_online_screening?: boolean;

  ticket_url?: string;
  /** Which portal `ticket_url` points at: 'ktx', 'ticketnet', 'venue-box-office'. */
  ticket_portal?: string;
  /** "Free", "By invitation", "₱250" — as published. */
  admission?: string;
}

/** What one adapter returns for one run. */
export interface FestivalScrapeResult {
  source: string;
  editions: FestivalEdition[];
  events: FestivalEvent[];
  /** Everything that went wrong, stated plainly. Never swallowed. */
  errors: string[];
  /**
   * Venue strings this adapter emitted that nothing could resolve. Surfaced
   * separately from errors because the fix is a row in
   * `festival_venue_aliases`, not a code change.
   */
  unmappedVenues?: string[];
}

export interface FestivalScrapeOptions {
  /** Skip the network and return nothing. */
  dryRun?: boolean;
  /** How far ahead to keep screenings. Festivals publish months out. */
  horizonDays?: number;
  maxConcurrency?: number;
}
