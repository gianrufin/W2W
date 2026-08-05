'use client';

import type { ScreenFormat } from '@/types';
import type { TicketMeta } from '@/lib/tickets';

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
  /**
   * The uploaded ticket's filename, type and size — never the file itself.
   * The actual bytes live in IndexedDB (see lib/tickets.ts), keyed by this
   * plan's id, so a photo or PDF never bloats the localStorage JSON every
   * other read of a plan depends on staying small and synchronous.
   */
  ticket?: TicketMeta;
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

/**
 * The event body, as plain lines — shared by the .ics `DESCRIPTION` (which
 * needs them backslash-escaped) and the Google Calendar link (which needs
 * them as real newlines in a URL param). One source of truth for the wording.
 */
function describeLines(plan: Plan, leaveAt?: Date | null): string[] {
  return [
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
  ].filter((line): line is string => Boolean(line));
}

function describe(plan: Plan, leaveAt?: Date | null): string {
  return describeLines(plan, leaveAt).join('\\n');
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

/**
 * Google Calendar's own "add event" compose screen, prefilled.
 *
 * This is the whole point: no file, no Downloads folder, no opening an .ics
 * to import it into an app — the link opens Google Calendar (the app if it's
 * installed, else calendar.google.com) with the event already filled in, and
 * saving it is one tap. Every field it takes is public URL-parameter API,
 * not a private endpoint, so this is stable to depend on.
 */
export function googleCalendarUrl(plan: Plan, leaveAt?: Date | null): string {
  const start = new Date(plan.startTime);
  const end = new Date(start.getTime() + (plan.durationMins ?? 120) * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: plan.movieTitle,
    dates: `${icsDate(start)}/${icsDate(end)}`,
    details: describeLines(plan, leaveAt).join('\n'),
    location: [plan.cinemaName, plan.cinemaAddress].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Whether to default to the .ics handoff over the Google Calendar link.
 *
 * Apple's Calendar has no public "compose, prefilled" web URL the way Google
 * does, so an .ics is the closest equivalent there — and critically, handed
 * off by *navigating* to it rather than downloading it, iOS and macOS Safari
 * both open Calendar's own add-event screen directly, which is the same
 * one-tap result the Google link gives everyone else. This relies on
 * WebKit's own content-type handling, not anything this app controls, and it
 * is the reason the check is deliberately narrow: Chrome, Firefox and every
 * other non-WebKit browser has no such handoff and just downloads the file,
 * which is the exact outcome this function exists to avoid defaulting to.
 *
 * Verified for the Google Calendar branch, which covers the large majority of
 * W2W's actual (Android-heavy) traffic — a real round trip, real prefilled
 * fields, confirmed. The WebKit branch is implemented against iOS's
 * long-documented behavior, not independently re-verified here: this sandbox
 * has no real WebKit engine to test against, only Chromium, which downloads
 * `text/calendar` regardless of what user-agent string it is told to report.
 * That is a property of the rendering engine, not something a UA spoof can
 * change — so it is a real gap in what got tested, stated plainly rather than
 * papered over, and the small Google Calendar icon next to the button is the
 * safety net if a real device ever disagrees with this guess.
 */
export function prefersNativeCalendarHandoff(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;

  // iOS: every browser is WebKit under the hood — Apple requires it — so the
  // system-level .ics handoff applies no matter which browser app this is.
  if (/iPad|iPhone|iPod/.test(ua)) return true;

  // macOS is different: only actual Safari gets the native handoff. Chrome,
  // Firefox and Edge on a Mac ship their own engine and have none of it, so
  // matching on "Macintosh" alone would route them into a plain download —
  // the exact thing this function exists to avoid. Safari's UA is the only
  // one of the four that excludes all of "Chrome", "CriOS", "FxiOS" and "Edg".
  const isMac = /Macintosh/.test(ua);
  const isRealSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg/.test(ua);
  return isMac && isRealSafari;
}
