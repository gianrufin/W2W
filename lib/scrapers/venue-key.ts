/**
 * The one venue-name normalisation.
 *
 * This lives alone, imported by both `geo.ts` and `osm.ts`, because it existed
 * as two copies and they drifted. OSM writes "Robinson's Place General Trias"
 * with an apostrophe; the copy in `osm.ts` split that into "robinson" + "s",
 * which no longer matched the other copy's "generaltrias" — so the venue that
 * was 12.7 km out stayed 12.7 km out, silently, while the fix looked applied.
 *
 * Two functions that must agree cannot be two functions.
 */

/**
 * Operator branding and filler. Removed so a chain's own inconsistent spellings
 * reconcile — "GALLERIA ORTIGAS" and "Robinsons Movieworld Galleria Ortigas"
 * must land on one key.
 *
 * The cost is that keys are ambiguous *across* operators ("Vista Mall Tanza"
 * and "SM City Tanza" both reduce to "tanza"), which is why every lookup that
 * uses this is scoped to a single chain. See the note in `geo.ts`.
 */
const OPERATOR_NOISE =
  /\b(robinsons?|movieworld|sm|smcinema|ayala|malls?|vista|starmall|megaworld|cineplex|cinemas?|cinema|the|at|city|place|mall|premier)\b/g;

export function venueKey(name: string): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes are deleted rather than spaced, so "Robinson's" reduces to
    // "robinsons" and matches "Robinsons". Spacing it left a stray "s" token
    // that survived the noise filter and poisoned the key.
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(OPERATOR_NOISE, ' ')
    .replace(/\s+/g, '');
}
