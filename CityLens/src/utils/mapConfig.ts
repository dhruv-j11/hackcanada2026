/**
 * mapConfig.ts — Single source of truth for all Mapbox map configuration.
 *
 * KEY CHANGE: Switched from dark-v11 (classic style, no built-in 3D buildings)
 * to Mapbox Standard with lightPreset: 'night' which provides:
 *   ✓ Native 3D extruded buildings out of the box
 *   ✓ Dark aesthetic matching dark-v11
 *   ✓ 3D lighting, shadows, and landmarks
 *   ✓ Slot-based layer insertion (top / middle / bottom)
 *
 * Uses the style JSON "imports" approach so the map loads in night mode
 * immediately with NO flash of daytime colors.
 */

export const MAPBOX_TOKEN =
  'pk.eyJ1IjoianBhdGVsMSIsImEiOiJjbW1mc29lMWowMHB0Mnlwc3Z0ZWFieHl6In0.sAyTPeUJKH7tdizuyQGFZw';

// ─── Map Center & Camera ─────────────────────────────
export const MAP_CENTER: [number, number] = [-80.5204, 43.4643];

export const INITIAL_VIEW_STATE = {
  center: MAP_CENTER,
  zoom: 14,
  pitch: 55,
  bearing: -15,
};

export const TARGET_VIEW_STATE = { ...INITIAL_VIEW_STATE };

// ─── Style Configuration ─────────────────────────────
// Mapbox Standard with night preset — loaded via style JSON imports
// so the map starts dark immediately (no flash of daytime).
//
// This replaces the old dark-v11 / light-v11 classic styles.
// Standard includes native 3D buildings, landmarks, and lighting.

export const DARK_STYLE_JSON = {
  version: 8 as const,
  imports: [
    {
      id: 'basemap',
      url: 'mapbox://styles/mapbox/standard',
      config: {
        lightPreset: 'night',
        showPointOfInterestLabels: true,
        showPlaceLabels: true,
        showRoadLabels: true,
        showTransitLabels: true,
      },
    },
  ],
  sources: {},
  layers: [],
};

export const LIGHT_STYLE_JSON = {
  version: 8 as const,
  imports: [
    {
      id: 'basemap',
      url: 'mapbox://styles/mapbox/standard',
      config: {
        lightPreset: 'day',
        showPointOfInterestLabels: true,
        showPlaceLabels: true,
        showRoadLabels: true,
        showTransitLabels: true,
      },
    },
  ],
  sources: {},
  layers: [],
};

// Default to dark
export const MAP_STYLE = DARK_STYLE_JSON;

// Keep legacy constants if anything else references them
export const DARK_STYLE = 'mapbox://styles/mapbox/standard';
export const LIGHT_STYLE = 'mapbox://styles/mapbox/standard';

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

// ─── 3D Building Colors (for custom building layers if needed) ──
export function buildingColor(isLight: boolean) {
  return [
    'interpolate', ['linear'], ['get', 'height'],
    0, isLight ? '#e2e8f0' : '#0f1d32',
    50, isLight ? '#cbd5e1' : '#1a2d4a',
    100, isLight ? '#94a3b8' : '#243b5c',
    200, isLight ? '#64748b' : '#2e4a6e',
  ] as unknown[];
}

// ─── ION LRT Styling ─────────────────────────────────
// NOTE: With Mapbox Standard's night preset, line layers need
// 'line-emissive-strength' to stay bright against the dark lighting.
export const ION_LINE_COLOR = '#06B6D4';
export const ION_LINE_WIDTH = 4;
export const ION_GLOW_WIDTH = 8;
export const ION_GLOW_OPACITY = 0.3;
export const ION_STATION_RADIUS = 6;
export const ION_LINE_EMISSIVE_STRENGTH = 1; // keeps ION line bright in night mode

// ─── Parcel Layer Configuration ─────────────────────
export const PARCEL_OUTLINE_COLOR = '#333333';
export const PARCEL_OUTLINE_WIDTH = 0.5;
export const PARCEL_OUTLINE_OPACITY = 0.4;
export const PARCEL_3D_OPACITY = 0.85;
export const PARCEL_FLAT_OPACITY = 0.7;

// ─── Standard Style Slots ────────────────────────────
// Mapbox Standard uses slots instead of beforeId for layer ordering.
// Use these when calling map.addLayer({ ..., slot: SLOT_MIDDLE })
export const SLOT_BOTTOM = 'bottom'; // below everything (terrain overlays)
export const SLOT_MIDDLE = 'middle'; // between buildings and labels (best for data layers)
export const SLOT_TOP = 'top';       // above everything (UI overlays)

// ─── Score Legend (from mapbox_config.json) ───────────
export const SCORE_LEGEND = [
  { color: '#9e9e9e', label: '0–30: Low Opportunity' },
  { color: '#fdd835', label: '31–60: Moderate Opportunity' },
  { color: '#f57c00', label: '61–80: High Opportunity' },
  { color: '#c62828', label: '81–100: Prime Opportunity' },
];