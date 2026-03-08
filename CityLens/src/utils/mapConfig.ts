/**
 * mapConfig.ts — Single source of truth for all Mapbox map configuration.
 * Embeds settings from mapbox_config.json so everything is in one place.
 */

export const MAPBOX_TOKEN = 'pk.eyJ1IjoianBhdGVsMSIsImEiOiJjbW1mc29lMWowMHB0Mnlwc3Z0ZWFieHl6In0.sAyTPeUJKH7tdizuyQGFZw';

// ─── Map Center & Camera ─────────────────────────────
export const MAP_CENTER: [number, number] = [-80.5204, 43.4643];

export const INITIAL_VIEW_STATE = {
  center: MAP_CENTER,
  zoom: 14,
  pitch: 55,
  bearing: -15,
};

export const TARGET_VIEW_STATE = { ...INITIAL_VIEW_STATE };

// ─── Style URLs ──────────────────────────────────────
export const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
export const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';
export const MAP_STYLE = DARK_STYLE;

// ─── Score Color Ramp (from mapbox_config.json) ──────
// 4-tier color ramp: Grey → Yellow → Orange → Red
export const SCORE_COLOR_RAMP: unknown[] = [
  'interpolate', ['linear'], ['get', 'score'],
  0, '#9e9e9e',
  30, '#bdbdbd',
  31, '#fff176',
  60, '#fdd835',
  61, '#ffb74d',
  80, '#f57c00',
  81, '#ef5350',
  100, '#c62828',
];

// ─── Score Extrusion Height ─────────────────────────
export const SCORE_HEIGHT_EXPR: unknown[] = [
  'interpolate', ['linear'], ['get', 'score'],
  0, 5,
  50, 25,
  100, 80,
];

// ─── 3D Building Colors ─────────────────────────────
export function buildingColor(isLight: boolean) {
  return [
    'interpolate', ['linear'], ['get', 'height'],
    0, isLight ? '#e2e8f0' : '#0f1d32',
    50, isLight ? '#cbd5e1' : '#1a2d4a',
    100, isLight ? '#94a3b8' : '#243b5c',
    200, isLight ? '#64748b' : '#2e4a6e',
  ] as unknown[];
}

// ─── 3D Buildings Layer Config ───────────────────────
// dark-v11 doesn't include a 3D buildings layer by default.
// We add one manually on style.load using the 'composite' source
// which contains building height data from Mapbox Streets.
export const BUILDINGS_3D_CONFIG = {
  id: '3d-buildings',
  source: 'composite',
  sourceLayer: 'building',
  filter: ['==', 'extrude', 'true'] as unknown[],
  type: 'fill-extrusion' as const,
  minzoom: 14,
  paint: {
    'fill-extrusion-color': [
      'interpolate', ['linear'], ['get', 'height'],
      0, '#0f1d32',
      50, '#1a2d4a',
      100, '#243b5c',
      200, '#2e4a6e',
    ] as unknown[],
    'fill-extrusion-height': [
      'interpolate', ['linear'], ['zoom'],
      14, 0,
      14.05, ['get', 'height'],
    ] as unknown[],
    'fill-extrusion-base': [
      'interpolate', ['linear'], ['zoom'],
      14, 0,
      14.05, ['get', 'min_height'],
    ] as unknown[],
    'fill-extrusion-opacity': 0.7,
  },
};

/**
 * Call this inside your map's 'style.load' event handler
 * to add 3D extruded buildings to dark-v11.
 *
 * Usage:
 *   map.on('style.load', () => {
 *     add3DBuildings(map);
 *   });
 */
export function add3DBuildings(map: mapboxgl.Map) {
  const layers = map.getStyle().layers;
  if (!layers) return;

  // Find the first symbol layer so buildings render beneath labels
  const labelLayerId = layers.find(
    (layer) => layer.type === 'symbol' && (layer.layout as any)?.['text-field']
  )?.id;

  // Avoid duplicate layer if style reloads
  if (map.getLayer(BUILDINGS_3D_CONFIG.id)) return;

  map.addLayer(
    {
      id: BUILDINGS_3D_CONFIG.id,
      source: BUILDINGS_3D_CONFIG.source,
      'source-layer': BUILDINGS_3D_CONFIG.sourceLayer,
      filter: BUILDINGS_3D_CONFIG.filter,
      type: BUILDINGS_3D_CONFIG.type,
      minzoom: BUILDINGS_3D_CONFIG.minzoom,
      paint: BUILDINGS_3D_CONFIG.paint,
    } as any,
    labelLayerId
  );
}

// ─── ION LRT Styling ─────────────────────────────────
export const ION_LINE_COLOR = '#06B6D4';
export const ION_LINE_WIDTH = 4;
export const ION_GLOW_WIDTH = 8;
export const ION_GLOW_OPACITY = 0.3;
export const ION_STATION_RADIUS = 6;

// ─── Parcel Layer Configuration ─────────────────────
export const PARCEL_OUTLINE_COLOR = '#333333';
export const PARCEL_OUTLINE_WIDTH = 0.5;
export const PARCEL_OUTLINE_OPACITY = 0.4;
export const PARCEL_3D_OPACITY = 0.85;
export const PARCEL_FLAT_OPACITY = 0.7;

// ─── Score Legend (from mapbox_config.json) ───────────
export const SCORE_LEGEND = [
  { color: '#9e9e9e', label: '0–30: Low Opportunity' },
  { color: '#fdd835', label: '31–60: Moderate Opportunity' },
  { color: '#f57c00', label: '61–80: High Opportunity' },
  { color: '#c62828', label: '81–100: Prime Opportunity' },
];