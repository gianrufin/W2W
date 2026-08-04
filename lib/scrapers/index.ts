export * from './base-scraper';
export * from './venues';
export * from './http';
export { createGeoResolver, resetGeoResolver, GeoResolver, venueKey } from './geo';
export { VistaCloudScraper, smCinemaScraper, ayalaCinemaScraper, VISTA_CLOUD_SCRAPERS } from './vista-cloud';
export { VistaCinemaScraper, vistaCinemaScraper } from './vista-cinema';
export { RobinsonsScraper, robinsonsScraper } from './robinsons';
export { MegaworldScraper, megaworldScraper } from './megaworld';
export { TicketNetScraper, ticketNetScraper } from './ticketnet';
export { ClickTheCityScraper, clickTheCityScraper, fetchTheaterDirectory } from './clickthecity';
export { MicrocinemaScraper, microcinemaScraper } from './microcinemas';
export { FestivalScreeningsScraper, festivalScreeningsScraper } from './festival-screenings';
export * from './festivals';
export { ingestScrapeResult, runPipeline, pruneExpiredShowtimes } from './pipeline';
export { enrichMovies } from './tmdb';

import { smCinemaScraper, ayalaCinemaScraper } from './vista-cloud';
import { vistaCinemaScraper } from './vista-cinema';
import { robinsonsScraper } from './robinsons';
import { megaworldScraper } from './megaworld';
import { ticketNetScraper } from './ticketnet';
import { clickTheCityScraper } from './clickthecity';
import { microcinemaScraper } from './microcinemas';
import { festivalScreeningsScraper } from './festival-screenings';
import type { BaseScraper } from './base-scraper';

/**
 * Every scraper the scheduled worker runs, in the order it runs them.
 *
 * Order is not cosmetic. The chains come first so their venues and showtimes —
 * the ones with real booking deep-links — are written before the aggregator
 * runs; ClickTheCity is last and deliberately skips schedules for chains
 * already covered, so it fills the map's gaps rather than papering over the
 * good data with linkless rows.
 */
export const ALL_SCRAPERS: BaseScraper[] = [
  // Chain-native, authoritative, with booking links.
  smCinemaScraper,
  ayalaCinemaScraper,
  robinsonsScraper,
  megaworldScraper,
  vistaCinemaScraper,
  ticketNetScraper,
  // Hand-entered confirmed festival screenings; see festival-screenings.ts.
  microcinemaScraper,
  festivalScreeningsScraper,
  // Nationwide backstop: everything with no bookable site of its own.
  clickTheCityScraper,
];
