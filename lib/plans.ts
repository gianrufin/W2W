'use client';

import type { ScreenFormat } from '@/types';

/**
 * Plans — a screening you have decided to go to.
 *
 * "Leave by 6:42 PM" told you something and then abandoned you. A plan is the
 * rest of that sentence: it survives a reload, counts down, exports to your
 * calendar with the alarm already set, and hands you off to navigation.
 *
 * Everything is stored locally. There are no accounts, and the app is a static
 * export with no server, so a plan lives in this browser and nowhere else —
 * which is stated in the UI rather than left to be discovered.
 */

const STORAGE_KEY = 'w2w:plans';

export interface Plan {
  /** Stable across re-saves of the same screening: cinema + film + time. */
  id: string;
  cinemaId: string;
  cinemaName: string;
  cinemaLat: number;
  cinemaLng: number;
  cinemaAddress?: string | null;
  movieTitle: string;
  posterUrl?: string | null;
  screenName?: string | null;
  format: ScreenFormat;
  /** ISO-8601 with the Manila offset, exactly as the showtime was stored. */
  startTime: string;
  durationMins?: number | null;
  bookingUrl?: string | null;
  ticketPrice?: number | null;
  createdAt: string;
}

/** Same screening saved twice is one plan, not two. */
export function planId(cinemaId: string, movieTitle: string, startTime: string): string {
  return `${cinemaId}|${movieTitle}|${startTime}`;
}

export function readPlans(): Plan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is Plan => Boolean(p && typeof (p as Plan).id === 'string'));
  } catch {
    // Private mode, quota, a corrupt value — a plan is a convenience, not a
    // reason to take the map down.
    return [];
  }
}

export function writePlans(plans: Plan[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Kept in memory for this session either way.
  }
}

/**
 * Drop plans whose screening finished a while ago.
 *
 * Two hours past the start covers all but the longest film, and keeping a
 * finished plan around turns "My plans" into a history nobody asked for.
 */
export function prunePastPlans(plans: Plan[], now = Date.now()): Plan[] {
  return plans.filter((p) => {
    const end = Date.parse(p.startTime) + (p.durationMins ?? 120) * 60_000;
    return end > now - 30 * 60_000;
  });
}

/**
 * A calendar event, with an alarm at the departure time.
 *
 * Chosen over a push notification deliberately: it needs no permission prompt,
 * works identically on every platform including iOS, and the reminder outlives
 * the app — uninstall W2W and the alarm is still in your calendar.
 */
export function planToIcs(plan: Plan, leaveAt?: Date | null): string {
  const start = new Date(plan.startTime);
  const end = new Date(start.getTime() + (plan.durationMins ?? 120) * 60_000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//W2W//Cinema//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(plan.id)}@w2w`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(plan.movieTitle)}`,
    `LOCATION:${icsEscape([plan.cinemaName, plan.cinemaAddress].filter(Boolean).join(', '))}`,
    `GEO:${plan.cinemaLat};${plan.cinemaLng}`,
    `DESCRIPTION:${icsEscape(describe(plan, leaveAt))}`,
  ];

  if (leaveAt) {
    // An absolute trigger rather than a relative one: the point is the moment
    // to leave, which depends on traffic, not on a fixed offset from the film.
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER;VALUE=DATE-TIME:${icsDate(leaveAt)}`,
      `DESCRIPTION:${icsEscape(`Time to leave for ${plan.movieTitle}`)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  // RFC 5545 wants CRLF, and Outlook is the one that actually enforces it.
  return lines.join('\r\n');
}

function describe(plan: Plan, leaveAt?: Date | null): string {
  const parts = [
    plan.screenName ? `${plan.screenName} · ${plan.format}` : plan.format,
    leaveAt
      ? `Leave by ${leaveAt.toLocaleTimeString('en-PH', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila',
        })}`
      : null,
    plan.bookingUrl ? `Tickets: ${plan.bookingUrl}` : null,
  ];
  return parts.filter(Boolean).join('\\n');
}

/** UTC basic format, which every calendar client accepts without a VTIMEZONE. */
function icsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function icsEscape(text: string): string {
  return text.replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
}

/**
 * Hand off to whatever maps app the device has.
 *
 * The `geo:` scheme is the honest choice on Android — it opens the user's
 * default, which may well be Waze — but iOS does not register it, so this falls
 * back to a Google Maps URL that works everywhere including desktop.
 */
export function directionsUrl(plan: Plan): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${plan.cinemaLat},${plan.cinemaLng}&destination_place_id=&travelmode=driving`;
}
