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
  return `${km.toFixed(1)} km away`;
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
