import type { TravelEstimate } from './types';

/**
 * When to leave home.
 *
 * The arithmetic is trivial; the constants are the feature. They encode local
 * knowledge the raw showtime does not carry, and getting them roughly right is
 * the difference between a number worth acting on and a number that makes
 * people miss films.
 *
 * The drive time is only half of the journey. The other half happens after the
 * car stops: finding a space, walking in from the basement, the counter, the
 * popcorn queue, finding a seat in the dark. That half is invisible to every
 * routing API and it is routinely twenty-odd minutes at a Philippine mall on a
 * Friday evening. Every constant below is named and commented rather than
 * folded into one expression, because each is a claim about how these venues
 * actually work and someone will want to tune them.
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
 * Finding a parking space.
 *
 * Off-peak this is two minutes. On a Friday evening at a large mall it is a
 * slow spiral up six levels behind everyone else with the same idea, and the
 * whole point of a departure time is that it survives the bad case.
 */
export const PARKING_MINUTES = 10;

/**
 * Car park to cinema lobby.
 *
 * Mall cinemas sit on the top floor and the car park sits under the building,
 * so this is a lift queue plus a walk across two floors of retail. It also
 * stands in for the last leg of a commute — the jeepney or tricycle drop-off
 * is at the mall entrance, not at the cinema door.
 */
export const WALK_IN_MINUTES = 6;

/**
 * The ticket counter.
 *
 * Booking ahead skips it, but most of our showtimes link out to a box office
 * rather than a confirmed seat, so the departure time has to assume the queue.
 */
export const TICKETING_MINUTES = 5;

/** Popcorn and drinks. The queue is the reason people arrive during trailers. */
export const CONCESSIONS_MINUTES = 8;

/** Handing over the ticket and finding the row in the dark. */
export const SEATING_MINUTES = 3;

/**
 * Everything between arriving at the venue and being in the seat.
 *
 * Kept as a derived sum so tuning any one step moves the departure time and
 * the explanation the UI prints stays true to the parts.
 */
export const GROUND_MINUTES =
  PARKING_MINUTES + WALK_IN_MINUTES + TICKETING_MINUTES + CONCESSIONS_MINUTES + SEATING_MINUTES;

/**
 * Kept for callers that predate the breakdown. Same meaning, bigger number:
 * the old value counted parking and the counter only.
 *
 * @deprecated Use {@link GROUND_MINUTES}.
 */
export const ARRIVAL_BUFFER_MINUTES = GROUND_MINUTES;

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
  /** True once leaving now would not get you seated before the feature. */
  missed: boolean;
  /** Allowance built in for parking, the walk, the queues and getting seated. */
  groundMinutes: number;
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
  // The real deadline is the feature starting, not the printed time.
  const featureStarts = start + TRAILER_MINUTES * 60_000;
  // Back off the whole on-the-ground sequence, then the journey itself.
  const leaveAt = new Date(featureStarts - (GROUND_MINUTES + estimate.minutes) * 60_000);
  const minutesUntil = Math.round((leaveAt.getTime() - Date.now()) / 60_000);

  return {
    leaveAt,
    minutesUntil,
    // Being past the ideal departure is not the same as having missed the film:
    // most of the allowance is skippable, and someone who forgoes the popcorn
    // is still in their seat. It is missed only once the drive alone no longer
    // fits before the feature starts.
    missed: Date.now() + estimate.minutes * 60_000 > featureStarts,
    groundMinutes: GROUND_MINUTES,
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

/**
 * Why the departure time is earlier than the drive alone suggests.
 *
 * Printed next to it, because a number that looks too cautious gets ignored —
 * whereas "includes 32 min to park, queue and get seated" is checkable, and
 * someone who has already booked and skips snacks can knowingly shave it.
 */
export function describeAllowance(plan: LeaveByPlan): string {
  return `incl. ${plan.groundMinutes} min to park, queue & get seated`;
}
