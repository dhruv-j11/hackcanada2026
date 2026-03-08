export const MAPBOX_TOKEN = 'pk.eyJ1IjoianBhdGVsMSIsImEiOiJjbW1mc29lMWowMHB0Mnlwc3Z0ZWFieHl6In0.sAyTPeUJKH7tdizuyQGFZw';

// ─── Map Center & Camera (from mapbox_config.json) ───
export const MAP_CENTER: [number, number] = [-80.5204, 43.4643];

export const INITIAL_VIEW_STATE = {
  center: MAP_CENTER,
  zoom: 14,
  pitch: 45,
  bearing: -15,
};

// TARGET_VIEW_STATE kept for flyTo / reset-view
export const TARGET_VIEW_STATE = {
  center: MAP_CENTER,
  zoom: 14,
  pitch: 45,
  bearing: -15,
};

// ─── Style URLs ──────────────────────────────────────
export const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
export const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';
export const MAP_STYLE = DARK_STYLE;

// ─── Score Color Ramp (from mapbox_config.json) ──────
// Used for parcel score → color mapping on both 3D and flat layers
export const SCORE_COLOR_RAMP: unknown[] = [
  'interpolate', ['linear'], ['get', 'score'],
  0, '#9e9e9e', 30, '#bdbdbd',
  31, '#fff176', 60, '#fdd835',
  61, '#ffb74d', 80, '#f57c00',
  81, '#ef5350', 100, '#c62828',
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
