import type { Coordinates } from '@/types';

/**
 * Travel estimation.
 *
 * Two implementations sit behind this: a live traffic provider and an offline
 * time-of-day model. The interface exists so the UI never has to know which one
 * answered — but the *estimate* always carries its own provenance, because a
 * number from live traffic and a number from a lookup table deserve different
 * amounts of trust and the user is entitled to know which they got.
 */

export interface TravelEstimate {
  /** Door-to-door driving time, minutes. */
  minutes: number;
  /**
   * Where the number came from.
   *
   *   traffic — a routing provider, using real roads and live conditions
   *   model   — typical speeds for this hour and day, from straight-line distance
   */
  source: 'traffic' | 'model';
  /**
   * How much to trust it, which drives whether the UI shows a departure time at
   * all. A model estimate over a long distance is a guess wearing a number's
   * clothing.
   */
  confidence: 'high' | 'low';
  /** Human note for the UI: "typical traffic", "live traffic". */
  label: string;
}

export interface TravelQuery {
  from: Coordinates;
  to: Coordinates;
  /**
   * When the journey starts. Matters more than anything else here: EDSA at
   * 14:00 and EDSA at 18:00 are different roads, so an estimate for a 9pm
   * screening must not be built from traffic at 5pm.
   */
  departAt: Date;
}

export interface TravelProvider {
  readonly id: string;
  estimate(query: TravelQuery): Promise<TravelEstimate | null>;
}
