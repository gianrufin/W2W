export * from './types';
export { ScheduleModelProvider, scheduleModelProvider, speedAt } from './schedule-model';
export { MapboxTrafficProvider } from './mapbox';
export {
  planLeaveBy,
  formatLeaveAt,
  TRAILER_MINUTES,
  ARRIVAL_BUFFER_MINUTES,
  MODEL_MAX_CONFIDENT_MINUTES,
  type LeaveByPlan,
} from './leave-by';

import { scheduleModelProvider } from './schedule-model';
import { MapboxTrafficProvider } from './mapbox';
import type { TravelEstimate, TravelQuery } from './types';

const mapbox = new MapboxTrafficProvider(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

/** Whether live traffic is configured — the UI says which number it is showing. */
export const hasLiveTraffic = mapbox.available;

/**
 * Estimate a drive, preferring live traffic.
 *
 * The model is not a placeholder for the traffic provider; it is the floor.
 * Whatever happens to a network call — no token, over quota, offline, Mapbox
 * having a bad day — the user still gets a usable answer, correctly labelled as
 * the weaker one.
 *
 * Returns null when neither can answer honestly. That happens for trips the
 * model is not valid over: this is an archipelago, and "53 hr drive" to Cebu is
 * a confident answer to a question with no driving answer. Callers show the
 * distance alone rather than a number nobody should act on.
 */
export async function estimateTravel(query: TravelQuery): Promise<TravelEstimate | null> {
  const live = await mapbox.estimate(query);
  return live ?? (await scheduleModelProvider.estimate(query));
}
