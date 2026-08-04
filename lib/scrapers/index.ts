export * from './base-scraper';
export * from './venues';
export { SMCinemaScraper, smCinemaScraper } from './sm-cinema';
export { AyalaCinemaScraper, ayalaCinemaScraper } from './ayala-cinema';
export { VistaCinemaScraper, vistaCinemaScraper } from './vista-cinema';
export { MicrocinemaScraper, microcinemaScraper } from './microcinemas';
export { FestivalScreeningsScraper, festivalScreeningsScraper } from './festival-screenings';
export * from './festivals';
export { ingestScrapeResult, runPipeline, pruneExpiredShowtimes } from './pipeline';
export { enrichMovies } from './tmdb';

import { smCinemaScraper } from './sm-cinema';
import { ayalaCinemaScraper } from './ayala-cinema';
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
