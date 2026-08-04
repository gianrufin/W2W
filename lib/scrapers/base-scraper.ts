import type { CinemaChain, MovieCategory, ScreenFormat } from '@/types';

/** A venue as the scraper found it, before it is reconciled with the DB. */
export interface ScrapedCinema {
  name: string;
  slug: string;
  chain: CinemaChain;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  website_url?: string;
  logo_url?: string;
}

export interface ScrapedMovie {
  title: string;
  slug: string;
  normalized_title: string;
  synopsis?: string;
  poster_url?: string;
  rating?: string;
  duration_mins?: number;
  category: MovieCategory;
  festival_name?: string;
}

export interface ScrapedShowtime {
  cinema_slug: string;
  movie_slug: string;
  screen_name?: string;
  format: ScreenFormat;
  /** ISO-8601 with offset. Always emit +08:00 for Philippine screenings. */
  start_time: string;
  booking_url?: string;
  ticket_price?: number;
}

export interface ScrapeResult {
  source: string;
  cinemas: ScrapedCinema[];
  movies: ScrapedMovie[];
  showtimes: ScrapedShowtime[];
  errors: string[];
}

export interface ScrapeOptions {
  /** Local Manila dates (yyyy-MM-dd) to fetch. Defaults to today + 2 days. */
  dates?: string[];
  /** Skip network calls and return the scraper's built-in sample payload. */
  dryRun?: boolean;
  maxConcurrency?: number;
}

/**
 * Format detection table.
 *
 * Order matters: the first entry whose pattern matches wins, so the most
 * specific labels ("IMAX 3D") must precede their prefixes ("IMAX"). Chains
 * write these labels inconsistently — SM uses "Director's Club", Ayala uses
 * "A-Luxe", Vista writes "DOLBY ATMOS" in caps — so every pattern is matched
 * against an uppercased, punctuation-collapsed haystack.
 */
const FORMAT_PATTERNS: ReadonlyArray<{ format: ScreenFormat; patterns: RegExp[] }> = [
  { format: 'IMAX 3D', patterns: [/IMAX\s*3\s*D/, /3\s*D\s*IMAX/] },
  { format: 'IMAX', patterns: [/\bIMAX\b/] },
  { format: '4DX', patterns: [/\b4\s*DX\b/] },
  { format: 'ScreenX', patterns: [/SCREEN\s*X/] },
  { format: 'Dolby Atmos', patterns: [/DOLBY\s*ATMOS/, /\bATMOS\b/] },
  { format: "Director's Club", patterns: [/DIRECTOR'?S?\s*CLUB/, /\bDC\b/] },
  { format: 'A-Luxe', patterns: [/A\s*-?\s*LUXE/] },
  { format: 'A-Max', patterns: [/A\s*-?\s*MAX/] },
  { format: 'VIP', patterns: [/\bVIP\b/, /PREMIER\s*E?\s*SUITE/] },
  { format: 'Giant Screen', patterns: [/GIANT\s*SCREEN/, /\bMEGA\s*SCREEN\b/] },
  { format: '3D', patterns: [/\b3\s*D\b/] },
  { format: '2D', patterns: [/\b2\s*D\b/] },
];

/**
 * Titles the chains spell differently enough that normalization alone will not
 * reconcile them. Keys are already-normalized forms; values are the canonical
 * normalized title. Extend this as scrapers surface new mismatches.
 */
const TITLE_ALIASES: Record<string, string> = {
  SPIDERMANBEYONDSPIDERVERSE: 'SPIDERMANBEYONDTHESPIDERVERSE',
  SPIDERMANACROSSSPIDERVERSE: 'SPIDERMANACROSSTHESPIDERVERSE',
  DUNEPART2: 'DUNEPARTTWO',
  DUNE2: 'DUNEPARTTWO',
  AVATARWAYOFWATER: 'AVATARTHEWAYOFWATER',
  MI8: 'MISSIONIMPOSSIBLE8',
  LOTRFELLOWSHIP: 'THELORDOFTHERINGSTHEFELLOWSHIPOFTHERING',
};

/** Trailing/leading noise chains bolt onto titles before we normalize. */
const TITLE_NOISE = [
  /\((imax|imax\s*3d|3d|2d|4dx|screenx|dolby\s*atmos|atmos|digital|eng(lish)?\s*sub(s|title[sd])?)\)/gi,
  /\[(.*?)\]/g,
  /\b(imax\s*3d|imax|4dx|screenx|dolby\s*atmos|director'?s?\s*club|a-?luxe|a-?max|vip)\b/gi,
  /\b(re-?release|encore|special\s*screening|advance\s*screening|premiere\s*night)\b/gi,
  /\b(sub|dub|subtitled|dubbed)\b/gi,
];

export abstract class BaseScraper {
  /** Stable identifier written to `showtimes.source`. */
  abstract readonly source: string;
  abstract readonly chain: CinemaChain;

  abstract scrape(options?: ScrapeOptions): Promise<ScrapeResult>;

  /**
   * Collapse a chain's title spelling into a comparison key.
   * "Spider-Man: Beyond the Spider-Verse (IMAX)" and "SPIDERMAN BEYOND
   * SPIDERVERSE" both land on SPIDERMANBEYONDTHESPIDERVERSE.
   */
  normalizeMovieTitle(raw: string): string {
    let title = raw ?? '';
    for (const pattern of TITLE_NOISE) title = title.replace(pattern, ' ');

    const key = title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/&/g, 'AND')
      .replace(/[^A-Z0-9]/g, '');

    return TITLE_ALIASES[key] ?? key;
  }

  /** Human-facing title: noise stripped, whitespace collapsed, casing kept. */
  cleanTitle(raw: string): string {
    let title = raw ?? '';
    for (const pattern of TITLE_NOISE) title = title.replace(pattern, ' ');
    return title.replace(/\s{2,}/g, ' ').replace(/[\s:–-]+$/, '').trim();
  }

  slugify(raw: string): string {
    return (raw ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Infer the screening format from any combination of title, screen name and
   * badge text the site exposes. Falls back to 2D, which is what every chain
   * means when it omits the label.
   */
  detectFormat(...fragments: (string | null | undefined)[]): ScreenFormat {
    const haystack = fragments
      .filter(Boolean)
      .join(' ')
      .toUpperCase()
      .replace(/[._]/g, ' ');

    for (const { format, patterns } of FORMAT_PATTERNS) {
      if (patterns.some((p) => p.test(haystack))) return format;
    }
    return '2D';
  }

  /**
   * Build an ISO timestamp in Philippine time (UTC+8, no DST) from a local
   * date and a wall-clock time as printed on the schedule.
   */
  toManilaISO(date: string, time: string): string {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) throw new Error(`Unparseable showtime "${time}" for ${date}`);

    let hour = Number(match[1]);
    const minute = match[2];
    const meridiem = match[3]?.toUpperCase();

    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    return `${date}T${String(hour).padStart(2, '0')}:${minute}:00+08:00`;
  }

  /** Default scrape window: today plus the next two days, Manila-local. */
  defaultDates(count = 3): string[] {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < count; i += 1) {
      const d = new Date(now.getTime() + i * 86_400_000 + 8 * 3_600_000);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  protected emptyResult(): ScrapeResult {
    return { source: this.source, cinemas: [], movies: [], showtimes: [], errors: [] };
  }
}
