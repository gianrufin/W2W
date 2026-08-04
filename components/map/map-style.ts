import type { StyleSpecification } from 'maplibre-gl';

/**
 * Map style resolution.
 *
 * With a MapTiler key we use their dark vector basemap. Without one, we fall
 * back to a hand-rolled style built on the free OSM raster tiles, desaturated
 * and darkened with raster filters — the app must never render a blank canvas
 * just because no map key is configured.
 */

const OSM_DARK_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'canvas',
      type: 'background',
      paint: { 'background-color': '#09090b' },
    },
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.55,
        'raster-saturation': -0.85,
        'raster-contrast': 0.15,
        'raster-brightness-max': 0.55,
      },
    },
  ],
};

export function resolveMapStyle(): string | StyleSpecification {
  const maptiler = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (maptiler) {
    return `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptiler}`;
  }
  return OSM_DARK_FALLBACK;
}
