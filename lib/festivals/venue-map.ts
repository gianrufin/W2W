import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Festival venue strings → real cinema branches.
 *
 * This is the layer the whole module turns on. Festivals name venues the way an
 * audience says them, and a screening whose venue cannot be placed is a
 * screening that cannot appear on a map:
 *
 *   "GATEWAY 11"          → Gateway Cineplex 18, screen 11
 *   "TRINOMA 3"           → Trinoma Cinemas, screen 3
 *   "Cinematheque Manila" → FDCP Cinematheque Manila
 *   "CCP"                 → Cultural Center of the Philippines
 *
 * Note the first two: a festival's "venue" is often a *screen* inside a venue
 * we already have. Splitting the trailing number off is most of the work.
 *
 * Three passes, most trustworthy first:
 *
 *   1. `festival_venue_aliases` — an explicit, human-entered mapping. Always
 *      wins. A wrong pin is fixed with an INSERT rather than a deploy.
 *   2. Exact match on a normalised cinema name.
 *   3. Containment, accepted only when exactly one branch matches. Two
 *      candidates means the string is ambiguous, and an ambiguous pin is a
 *      wrong pin.
 *
 * Anything that survives all three is **reported, not guessed**. The
 * `unmappedVenues` list on a run is the queue of aliases to add.
 */

export interface ResolvedVenue {
  cinemaId: string;
  cinemaName: string;
  /** Screen parsed out of the festival's string, e.g. "11" from "GATEWAY 11". */
  screenName?: string;
  how: 'alias' | 'exact' | 'contains';
}

interface CinemaRow {
  id: string;
  name: string;
  city: string | null;
}

/**
 * Words that identify an operator or a building type rather than a place.
 *
 * Kept deliberately shorter than the scraper-side list: festival strings are
 * already terse, and over-stripping "Cinematheque Manila" down to "manila"
 * would collide with every cinema in the city.
 */
const NOISE = /\b(cinemas?|cineplex|theatre|theater|mall|cinema)\b/g;

export function normaliseVenue(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, '');
}

/**
 * Split a trailing screen number off a festival venue string.
 *
 * "GATEWAY 11" is Gateway, screen 11 — not a venue called "Gateway 11". But
 * "Gateway Mall 2" *is* a distinct building, and "Cinema 76" is a venue whose
 * name ends in a number. So the split only applies to a bare trailing integer
 * on a string with at least one other word, and both readings are returned:
 * the caller tries the whole string first and falls back to the split.
 */
export function splitScreen(raw: string): { venue: string; screen?: string } {
  const match = /^(.*\S)\s+(\d{1,2})$/.exec(raw.trim());
  if (!match) return { venue: raw.trim() };
  return { venue: match[1], screen: `Cinema ${match[2]}` };
}

/**
 * Venue resolver for one ingest run.
 *
 * Loads every cinema and every alias once. The whole table is a few hundred
 * rows, and doing it per-event would mean thousands of round trips for a
 * festival programme.
 */
export class FestivalVenueMap {
  private readonly aliases = new Map<string, { cinemaId: string; screenName?: string }>();
  private readonly byName = new Map<string, CinemaRow>();
  private readonly cinemas: CinemaRow[] = [];
  /** Venue strings this run could not place, deduplicated. */
  readonly unmapped = new Set<string>();

  private constructor() {}

  static async load(client: SupabaseClient): Promise<FestivalVenueMap> {
    const map = new FestivalVenueMap();

    const { data: cinemas, error: cinemaError } = await client
      .from('cinemas')
      .select('id, name, city');
    if (cinemaError) throw new Error(`venue map: ${cinemaError.message}`);

    for (const row of (cinemas ?? []) as CinemaRow[]) {
      map.cinemas.push(row);
      const key = normaliseVenue(row.name);
      // First writer wins, so two branches with the same normalised name do not
      // silently overwrite each other — containment will catch the ambiguity.
      if (key && !map.byName.has(key)) map.byName.set(key, row);
    }

    const { data: aliases, error: aliasError } = await client
      .from('festival_venue_aliases')
      .select('alias, cinema_id, screen_name');
    if (aliasError) throw new Error(`venue aliases: ${aliasError.message}`);

    for (const row of (aliases ?? []) as Array<{
      alias: string;
      cinema_id: string;
      screen_name: string | null;
    }>) {
      map.aliases.set(normaliseVenue(row.alias), {
        cinemaId: row.cinema_id,
        screenName: row.screen_name ?? undefined,
      });
    }

    return map;
  }

  /**
   * Resolve one festival venue string.
   *
   * Both readings are tried — the string whole, and the string with a trailing
   * screen number split off — but *certainty comes before completeness*: every
   * exact match is tried before any fuzzy one.
   *
   * That ordering is load-bearing. "GATEWAY 11" contains "Gateway Mall" once
   * both are normalised, so a naive whole-string-first pass resolved it to the
   * wrong building and silently dropped the screen number. Exact-first means a
   * real venue whose name ends in a digit ("Gateway Mall 2") still wins on its
   * own name, while "GATEWAY 11" falls through to the split.
   */
  resolve(rawVenue: string, city?: string | null): ResolvedVenue | null {
    const split = splitScreen(rawVenue);
    const readings: Array<{ text: string; screen?: string }> = [{ text: rawVenue }];
    if (split.screen) readings.push({ text: split.venue, screen: split.screen });

    for (const precise of [true, false]) {
      for (const reading of readings) {
        const hit = this.lookup(reading.text, city, precise);
        if (hit) return { ...hit, screenName: hit.screenName ?? reading.screen };
      }
    }

    this.unmapped.add(rawVenue);
    return null;
  }

  /** `preciseOnly` restricts this to alias and exact-name matches. */
  private lookup(
    text: string,
    city: string | null | undefined,
    preciseOnly: boolean,
  ): ResolvedVenue | null {
    const key = normaliseVenue(text);
    if (!key) return null;

    const alias = this.aliases.get(key);
    if (alias) {
      const cinema = this.cinemas.find((c) => c.id === alias.cinemaId);
      return cinema
        ? {
            cinemaId: cinema.id,
            cinemaName: cinema.name,
            screenName: alias.screenName,
            how: 'alias',
          }
        : null;
    }

    const exact = this.byName.get(key);
    if (exact) return { cinemaId: exact.id, cinemaName: exact.name, how: 'exact' };

    if (preciseOnly) return null;

    // Short keys match far too much to be trusted by containment.
    if (key.length < 5) return null;

    let candidates = this.cinemas.filter((c) => {
      const candidate = normaliseVenue(c.name);
      return candidate.length >= 5 && (candidate.includes(key) || key.includes(candidate));
    });

    // A city narrows a genuinely ambiguous name — "Cinematheque" exists in five
    // cities, and the festival almost always says which.
    if (candidates.length > 1 && city) {
      const inCity = candidates.filter(
        (c) => (c.city ?? '').toLowerCase() === city.toLowerCase(),
      );
      if (inCity.length) candidates = inCity;
    }

    if (candidates.length !== 1) return null;
    return { cinemaId: candidates[0].id, cinemaName: candidates[0].name, how: 'contains' };
  }
}
