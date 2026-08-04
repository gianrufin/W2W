import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CinemaChain, ScreenFormat } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MANILA_TZ = 'Asia/Manila';

/** All schedule display is Manila-local regardless of where the browser is. */
export function formatShowtime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MANILA_TZ,
  });
}

export function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: MANILA_TZ,
  });
}

/** yyyy-MM-dd for a Date, in Manila time. */
export function manilaDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addDaysKey(days: number): string {
  return manilaDateKey(new Date(Date.now() + days * 86_400_000));
}

/** Bounds of a Manila calendar day as UTC instants, for range queries. */
export function manilaDayRange(dateKey: string): { start: string; end: string } {
  return {
    start: new Date(`${dateKey}T00:00:00+08:00`).toISOString(),
    end: new Date(`${dateKey}T23:59:59+08:00`).toISOString(),
  };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  // Past 100 km the tenth is noise — nobody reads "573.4 km" differently
  // from "573 km", and the extra digit makes the row harder to scan.
  if (km >= 100) return `${Math.round(km)} km away`;
  return `${km.toFixed(1)} km away`;
}

/**
 * A span of minutes as people say it: "45 min", "1 hr 15 min", "2 hr".
 *
 * "127 min drive" is technically correct and nobody's mental model. Anything
 * over an hour gets split, and a whole number of hours drops the trailing
 * "0 min" rather than printing it.
 */
export function formatMinutes(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatDuration(mins?: number | null): string | null {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatPrice(price?: number | null): string | null {
  if (price == null) return null;
  return `₱${price.toFixed(0)}`;
}

/** True once the screening has started — used to dim past chips. */
export function hasStarted(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** Within the next 90 minutes: the "starting soon" pulse on the map. */
export function isStartingSoon(iso: string): boolean {
  const delta = new Date(iso).getTime() - Date.now();
  return delta > 0 && delta < 90 * 60_000;
}

/**
 * "Starts in 24 min" for anything close enough to matter, otherwise null.
 *
 * Deliberately capped at 90 minutes. Beyond that the countdown stops being
 * useful — "starts in 4 hrs" is worse than reading the time off the chip — and
 * it turns every card into an urgency signal, which makes none of them one.
 */
export function startsInLabel(iso: string): string | null {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes <= 0 || minutes > 90) return null;
  return minutes < 1 ? 'Starting now' : `Starts in ${minutes} min`;
}

/**
 * The screening this venue's card should highlight, given the chip row.
 *
 * Normally the next one you can still get to. Under "Last show" it is the
 * *final* screening of the day instead — that is the whole question being
 * asked, and highlighting the 1pm show when someone taps LFS would answer a
 * different one.
 */
export function highlightedShowtime<T extends { start_time: string }>(
  showtimes: T[],
  quick: string,
): T | null {
  const upcoming = showtimes.filter((s) => !hasStarted(s.start_time));
  if (!upcoming.length) return null;

  if (quick === 'Last show') {
    return upcoming.reduce((latest, s) =>
      Date.parse(s.start_time) > Date.parse(latest.start_time) ? s : latest,
    );
  }
  return upcoming.reduce((soonest, s) =>
    Date.parse(s.start_time) < Date.parse(soonest.start_time) ? s : soonest,
  );
}

/**
 * Does this venue survive the chip row over the results list?
 *
 * Lives here rather than in either component because the map and the list must
 * agree: a pin the list has filtered away but the map still shows is a pin that
 * opens an empty sheet.
 */
export function matchesQuickFilter(
  cinema: { showtimes: { start_time: string }[] },
  quick: string,
): boolean {
  // Premium and Indie are handled by the query itself — by the time results
  // arrive they are already narrowed, so there is nothing left to do here.
  if (quick === 'Soon') {
    return cinema.showtimes.some((s) => isStartingSoon(s.start_time));
  }

  // "Last show" keeps venues whose final screening of the day has not started.
  // Anything already under way is not a last show you can still catch.
  if (quick === 'Last show') {
    return cinema.showtimes.some((s) => !hasStarted(s.start_time));
  }

  return true;
}

/** Cheapest published price at this venue, or null when none is published. */
export function lowestPrice(
  cinema: { showtimes: { ticket_price?: number | null }[] },
): number | null {
  const prices = cinema.showtimes
    .map((s) => s.ticket_price)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Order the results list.
 *
 * "Nearest" keeps whatever order the database returned — that is already
 * proximity to what the map is looking at, computed in SQL against a spatial
 * index, and re-sorting it client-side would only be able to do it worse.
 *
 * Venues with no published price sort last under "Cheapest" rather than being
 * treated as free. Most chains publish nothing, so this ranks the ones that do.
 */
export function sortCinemas<
  T extends { distance_km: number; showtimes: { start_time: string; ticket_price?: number | null }[] },
>(cinemas: T[], sort: string): T[] {
  if (sort === 'Nearest') return cinemas;

  const rows = [...cinemas];

  if (sort === 'Soonest') {
    return rows.sort((a, b) => nextStart(a) - nextStart(b));
  }

  if (sort === 'Cheapest') {
    return rows.sort((a, b) => {
      const pa = lowestPrice(a);
      const pb = lowestPrice(b);
      if (pa === null && pb === null) return a.distance_km - b.distance_km;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb || a.distance_km - b.distance_km;
    });
  }

  return rows;
}

function nextStart(cinema: { showtimes: { start_time: string }[] }): number {
  const upcoming = cinema.showtimes
    .filter((s) => !hasStarted(s.start_time))
    .map((s) => Date.parse(s.start_time));
  // A venue with nothing left today sorts after everything that has something.
  return upcoming.length ? Math.min(...upcoming) : Number.POSITIVE_INFINITY;
}

/**
 * Rough driving time from straight-line distance.
 *
 * 22 km/h is Metro Manila's actual average traffic speed, which is the number
 * that makes this honest rather than flattering. It is an estimate and the UI
 * says "approx" nowhere — it says "min drive", which is how everyone reads it.
 */
export function driveMinutes(km: number): number {
  return Math.max(1, Math.round((km / 22) * 60));
}

const PREMIUM_FORMATS: ScreenFormat[] = [
  'IMAX',
  'IMAX 3D',
  'A-Max',
  'Giant Screen',
  'ScreenX',
  '4DX',
  'Dolby Atmos',
  "Director's Club",
  'A-Luxe',
  'VIP',
];

export function isPremiumFormat(format: ScreenFormat): boolean {
  return PREMIUM_FORMATS.includes(format);
}

/**
 * Format badge treatment, mapped onto the tonal container roles so each family
 * reads correctly in both themes. Ordinary 2D/3D stays on the neutral surface
 * chip so the premium tiers actually read as special.
 */
export function formatBadgeClass(format: ScreenFormat): string {
  switch (format) {
    case 'IMAX':
    case 'IMAX 3D':
    case 'Giant Screen':
    case 'A-Max':
      return 'bg-secondarysoft text-secondarysoftfg border-secondary/20';
    case "Director's Club":
    case 'VIP':
    case 'A-Luxe':
      return 'bg-tertiarysoft text-tertiarysoftfg border-tertiary/25';
    case 'Dolby Atmos':
      return 'bg-atmossoft text-atmossoftfg border-atmos/25';
    case '4DX':
    case 'ScreenX':
      return 'bg-brandsoft text-brandsoftfg border-brand/20';
    default:
      return 'bg-surface text-muted border-hairline';
  }
}

export function chainLabel(chain: CinemaChain): string {
  switch (chain) {
    case 'SM':
      return 'SM Cinema';
    case 'Ayala':
      return 'Ayala Malls Cinemas';
    case 'Vista':
      return 'Vista Cinemas';
    case 'Robinsons':
      return 'Robinsons Movieworld';
    case 'Megaworld':
      return 'Megaworld Lifestyle';
    case 'Fisher':
      return 'Fisher Box Office';
    case 'Newport':
      return 'Newport World Resorts';
    case 'ShangriLa':
      return 'Shangri-La Plaza';
    case 'Araneta':
      return 'Araneta City';
    case 'Microcinema':
      return 'Microcinema';
    case 'Independent':
      // Covers the cinematheques and the unaffiliated houses alike — Power
      // Plant, Greenhills, Bichara SilverScreens.
      return 'Independent';
    case 'FestivalVenue':
      return 'Festival Venue';
  }
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
