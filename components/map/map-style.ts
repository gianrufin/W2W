import type { StyleSpecification } from 'maplibre-gl';

/**
 * Map style resolution.
 *
 * Two styles, because the basemap has to follow the theme like everything else.
 * With a MapTiler key we use their vector basemaps; without one we fall back to
 * raster tiles — CARTO Positron in light (the same keyless basemap SpotMo uses)
 * and a darkened OSM raster in dark. The app must never render a blank canvas
 * just because no map key is configured.
 */

function rasterStyle(opts: {
  tiles: string[];
  attribution: string;
  background: string;
  paint: Record<string, number>;
}): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: opts.tiles,
        tileSize: 256,
        attribution: opts.attribution,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'canvas', type: 'background', paint: { 'background-color': opts.background } },
      { id: 'base', type: 'raster', source: 'base', paint: opts.paint },
    ],
  };
}

const LIGHT_FALLBACK = rasterStyle({
  tiles: [
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  ],
  attribution: '© OpenStreetMap contributors © CARTO',
  background: '#f6f2f3',
  paint: { 'raster-opacity': 1 },
});

const DARK_FALLBACK = rasterStyle({
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  attribution: '© OpenStreetMap contributors',
  background: '#0c0a0b',
  paint: {
    'raster-opacity': 0.55,
    'raster-saturation': -0.85,
    'raster-contrast': 0.15,
    'raster-brightness-max': 0.55,
  },
});

export function resolveMapStyle(theme: 'light' | 'dark'): string | StyleSpecification {
  const maptiler = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (maptiler) {
    const name = theme === 'dark' ? 'streets-v2-dark' : 'streets-v2-light';
    return `https://api.maptiler.com/maps/${name}/style.json?key=${maptiler}`;
  }
  return theme === 'dark' ? DARK_FALLBACK : LIGHT_FALLBACK;
}
