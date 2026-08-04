import type { TravelEstimate } from './types';

/**
 * When to leave home.
 *
 * The arithmetic is trivial; the constants are the feature. They encode local
 * knowledge the raw showtime does not carry, and getting them roughly right is
 * the difference between a number worth acting on and a number that makes
 * people miss films.
 *
 * All three are deliberately named and commented rather than folded into one
 * expression, because they are claims about how Philippine cinemas actually
 * work and someone will want to tune them.
 */

/**
 * Trailers and ads before the feature.
 *
 * Philippine chains run roughly 10–20 minutes. This is the one constant that
 * works in the viewer's favour: arriving exactly at the printed time is not
 * late. Being conservative here means telling people to leave earlier than
 * necessary, which is the safer direction to be wrong in — so this is set at
 * the low end of the range.
 */
export const TRAILER_MINUTES = 10;

/**
 * Parking, walking in from the car park, and the queue at the counter.
 *
 * Mall cinemas on a Friday evening are the worst case and the common case.
 */
export const ARRIVAL_BUFFER_MINUTES = 12;

/**
 * Do not print a departure time from a model estimate beyond this drive.
 *
 * A confident wrong departure time is worse than no departure time. Live
 * traffic earns the right to be specific over a long trip; a lookup table does
 * not, because the further out the journey the more a single incident matters.
 */
export const MODEL_MAX_CONFIDENT_MINUTES = 45;

export interface LeaveByPlan {
  /** When to walk out of the door. */
  leaveAt: Date;
  /** Minutes from now until then. Negative means you are already late. */
  minutesUntil: number;
  /** True once leaving now would not get you there in time. */
  missed: boolean;
  estimate: TravelEstimate;
}

/**
 * Work back from a showtime to a departure time.
 *
 * Returns null when we do not trust the estimate enough to name a minute —
 * the caller then shows the drive time alone, which is still useful and does
 * not pretend to precision it has not got.
 */
export function planLeaveBy(showtime: string, estimate: TravelEstimate): LeaveByPlan | null {
  if (estimate.source === 'model' && estimate.minutes > MODEL_MAX_CONFIDENT_MINUTES) {
    return null;
  }

  const start = new Date(showtime).getTime();
  // The real deadline is the feature starting, not the printed time — but you
  // still want to be in the building before the lights go down.
  const mustArriveBy = start + TRAILER_MINUTES * 60_000 - ARRIVAL_BUFFER_MINUTES * 60_000;
  const leaveAt = new Date(mustArriveBy - estimate.minutes * 60_000);
  const minutesUntil = Math.round((leaveAt.getTime() - Date.now()) / 60_000);

  return {
    leaveAt,
    minutesUntil,
    // A minute or two past is not "missed"; ten is.
    missed: minutesUntil < -10,
    estimate,
  };
}

/** "Leave by 6:42 PM" — Manila time, wherever the browser thinks it is. */
export function formatLeaveAt(plan: LeaveByPlan): string {
  return plan.leaveAt.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
}
