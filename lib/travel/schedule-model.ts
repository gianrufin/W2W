import { haversineKm } from '@/lib/utils';
import type { TravelEstimate, TravelProvider, TravelQuery } from './types';

/**
 * Time-of-day travel model — the estimator that always works.
 *
 * No key, no network, no quota, no outage. It is the fallback when the traffic
 * provider is unconfigured, rate-limited or unreachable, and it is what makes
 * "leave by" a feature the app owns rather than one it rents.
 *
 * The method is deliberately crude and honestly labelled: straight-line
 * distance, a detour factor for the fact that roads are not straight, and an
 * average speed that depends on the hour and the day. It cannot know about an
 * accident on EDSA. It can know that 6pm on a Friday is not 6am on a Sunday,
 * and in Metro Manila that is most of the variance.
 *
 * Every number below is a claim about the real world. They are set from
 * published Metro Manila traffic averages and are meant to be tuned — which is
 * why they are named constants with reasons attached rather than magic numbers
 * buried in an expression.
 */

/**
 * Roads are not straight lines. A journey of 5 km as the crow flies is roughly
 * 1.4× that on Metro Manila's road grid, which is bent around waterways, gated
 * subdivisions and one-way systems.
 */
const DETOUR_FACTOR = 1.4;

/**
 * Average speed in km/h by hour of day, Manila time, for a weekday.
 *
 * The two peaks are the commute. The midday trough is real but shallower than
 * people expect; the overnight figures are genuinely fast because the roads are
 * genuinely empty.
 */
const WEEKDAY_SPEED_KMH = [
  //  0    1    2    3    4    5    6    7    8    9   10   11
  38,  40,  42,  42,  40,  32,  22,  15,  14,  17,  20,  21,
  // 12   13   14   15   16   17   18   19   20   21   22   23
  20,  20,  19,  17,  15,  13,  13,  15,  19,  24,  30,  35,
];

/**
 * Weekends invert the pattern: no commute peak, but malls fill from midday and
 * the roads around them clog through the evening — which is exactly when and
 * where this app sends people.
 */
const WEEKEND_SPEED_KMH = [
  38,  40,  42,  42,  42,  40,  36,  33,  30,  27,  24,  22,
  20,  19,  18,  18,  17,  16,  16,  17,  19,  23,  28,  33,
];

/**
 * Beyond this, a straight-line estimate stops being defensible: the trip is
 * probably inter-city, involves an expressway with a completely different speed
 * profile, and the detour factor no longer holds.
 */
const HIGH_CONFIDENCE_MAX_KM = 25;

/**
 * Beyond this the model refuses to answer at all.
 *
 * The Philippines is an archipelago, and this model knows nothing about water.
 * Asked for Manila → Cebu it produced "53 hr 31 min drive", which is not a bad
 * estimate of a drive — it is a confident answer to a question with no driving
 * answer, since the route involves two ferries. Anything past a long day's
 * drive is out of scope, and saying nothing is the correct output.
 */
const MODEL_MAX_KM = 150;

export class ScheduleModelProvider implements TravelProvider {
  readonly id = 'schedule-model';

  // Synchronous work behind an async interface, so swapping in a network
  // provider needs no change at the call site.
  async estimate(query: TravelQuery): Promise<TravelEstimate | null> {
    const km = haversineKm(query.from, query.to) * DETOUR_FACTOR;
    // Out of range: no answer beats a confident wrong one. See MODEL_MAX_KM.
    if (km > MODEL_MAX_KM) return null;

    const speed = speedAt(query.departAt);
    const minutes = Math.max(1, Math.round((km / speed) * 60));

    return {
      minutes,
      source: 'model',
      // Long trips get flagged so the UI can decline to print a departure time
      // it does not really believe.
      confidence: km <= HIGH_CONFIDENCE_MAX_KM ? 'high' : 'low',
      label: 'typical traffic',
    };
  }
}

/** Average speed for a given instant, read in Manila time. */
export function speedAt(when: Date): number {
  // Manila is UTC+8 with no DST, so shifting and reading UTC parts is exact.
  const manila = new Date(when.getTime() + 8 * 3_600_000);
  const hour = manila.getUTCHours();
  const day = manila.getUTCDay();

  const weekend = day === 0 || day === 6;
  return (weekend ? WEEKEND_SPEED_KMH : WEEKDAY_SPEED_KMH)[hour];
}

export const scheduleModelProvider = new ScheduleModelProvider();
