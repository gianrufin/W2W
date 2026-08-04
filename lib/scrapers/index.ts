export * from './base-scraper';
export * from './venues';
export { VistaCloudScraper, smCinemaScraper, ayalaCinemaScraper, VISTA_CLOUD_SCRAPERS } from './vista-cloud';
export { VistaCinemaScraper, vistaCinemaScraper } from './vista-cinema';
export { MicrocinemaScraper, microcinemaScraper } from './microcinemas';
export { FestivalScreeningsScraper, festivalScreeningsScraper } from './festival-screenings';
export * from './festivals';
export { ingestScrapeResult, runPipeline, pruneExpiredShowtimes } from './pipeline';
export { enrichMovies } from './tmdb';

import { smCinemaScraper, ayalaCinemaScraper } from './vista-cloud';
import { vistaCinemaScraper } from './vista-cinema';
import { microcinemaScraper } from './microcinemas';
import { festivalScreeningsScraper } from './festival-screenings';
import type { BaseScraper } from './base-scraper';

/** Every scraper the scheduled worker runs. */
export const ALL_SCRAPERS: BaseScraper[] = [
  smCinemaScraper,
  ayalaCinemaScraper,
  vistaCinemaScraper,
  microcinemaScraper,
  // Hand-entered confirmed festival screenings; see festival-screenings.ts.
  festivalScreeningsScraper,
];
