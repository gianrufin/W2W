export * from './types';
export { FestivalAdapter } from './adapter';
export {
  FestivalVenueMap,
  normaliseVenue,
  splitScreen,
  type ResolvedVenue,
} from './venue-map';
export {
  ingestFestivalResult,
  runFestivalPipeline,
  archiveFinishedFestivals,
  type FestivalIngestSummary,
} from './pipeline';

export { QCinemaAdapter, qcinemaAdapter } from './adapters/qcinema';
export { FdcpCinemathequeAdapter, fdcpCinemathequeAdapter } from './adapters/fdcp';
export { CcpAdapter, ccpAdapter } from './adapters/ccp';
export { TicketNetFestivalAdapter, ticketNetFestivalAdapter } from './adapters/ticketnet';
export { CinemalayaAdapter, cinemalayaAdapter } from './adapters/cinemalaya';

import { qcinemaAdapter } from './adapters/qcinema';
import { fdcpCinemathequeAdapter } from './adapters/fdcp';
import { ccpAdapter } from './adapters/ccp';
import { ticketNetFestivalAdapter } from './adapters/ticketnet';
import { cinemalayaAdapter } from './adapters/cinemalaya';
import type { FestivalAdapter } from './adapter';

/**
 * Every festival adapter, in the order the worker runs them.
 *
 * Order matters for the same reason it does in the chain pipeline, but the
 * dependency is different: **date windows before screenings**.
 *
 * CCP and Cinemalaya establish that "Cinemalaya 22 runs 6–18 August". TicketNet
 * then emits 240 screenings against that edition. Running the window sources
 * first means the screenings attach to a festival whose `is_active` is already
 * correct, instead of one whose dates get filled in on the next run.
 */
export const ALL_FESTIVAL_ADAPTERS: FestivalAdapter[] = [
  // Windows and lineups.
  ccpAdapter,
  cinemalayaAdapter,
  // Programmes and screenings.
  qcinemaAdapter,
  ticketNetFestivalAdapter,
  fdcpCinemathequeAdapter,
];
