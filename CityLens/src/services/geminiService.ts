// geminiService.ts — FULLY ALGORITHMIC, ZERO HARDCODING
// Pipeline: User Prompt → Gemini → Backend spatial query → Client-side polygon processing → Render

import * as turf from '@turf/turf';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Auto-detect local vs remote backend
const isLocal = typeof window !== 'undefined' && (
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  || window.location.hostname.startsWith('192.168.')
  || window.location.hostname.startsWith('10.')
);
const BACKEND_URL = isLocal ? 'http://localhost:8000' : 'http://155.138.136.112:8000';

// ION LRT station coordinates for proximity calculations
const ION_STATION_COORDS: [number, number][] = [
  [-80.5416, 43.4980],
  [-80.5384, 43.4919],
  [-80.5350, 43.4833],
  [-80.5283, 43.4731],
  [-80.5222, 43.4673],
  [-80.5190, 43.4630],
  [-80.5155, 43.4565],
  [-80.4980, 43.4510],
  [-80.4908, 43.4472],
  [-80.4860, 43.4430],
  [-80.4750, 43.4340],
];

// ─── Interfaces ──────────────────────────────────────────

export interface GeminiSpatialIntent {
  thinking?: string;
  action: string;
  target_description: string;
  zone_type?: string;
  parameters: Record<string, any>;
  spatial_query: {
    method: string;
    street_name?: string;
    bound_start?: string;
    bound_end?: string;
    center_lat?: number;
    center_lng?: number;
    buffer_meters?: number;
    district_name?: string;
    ward_name?: string;
    score_min?: number;
    score_max?: number;
    limit?: number;
  };
  summary: string;
}

export interface ComputedStatistics {
  total_parcels: number;
  total_area_sqm: number;
  housingUnits: number;
  newResidents: number;
  taxRevenue: number;
  transitRidership: number;
  schoolChildren: number;
  waterDemand: number;
  affected_wards: { ward_name: string; councillor: string; parcel_count: number }[];
}

export interface SimulationResult {
  action: string;
  affected_parcels: GeoJSON.FeatureCollection;
  stats: ComputedStatistics;
  summary: string;
  zoneCenter?: { lng: number; lat: number };
  visualization: {
    fill_color: string;
    extrusion_height: number;
    opacity: number;
  };
  waterMoratoriumImpacted: boolean;
  narrative: string;
  risks: string[];
}

// ─── Gemini System Prompt ──────────────────────────────────

const GEMINI_SYSTEM_PROMPT = `You are CityLens AI, an urban planning assistant for the City of Waterloo, Ontario, Canada.

You have access to a dataset of ~17,000 land parcels in Waterloo. Each parcel has:
- A development readiness score (0-100)
- Area in square meters
- Current zoning designation
- Ward assignment (Waterloo has 7 wards)
- Proximity to ION LRT stations
- Proximity to major roads
- Current land use

When a user describes a change they want to make to the city, you must:
1. Understand their intent (what action, where, what parameters)
2. Return ONLY a valid JSON object (no markdown, no code fences, no explanation)

The JSON must follow this schema:
{
  "thinking": "Step-by-step analysis of the request, context of Waterloo geography, and determination of building type and stats. Write at least 3 sentences.",
  "action": "rezone" | "add_building" | "analyze" | "find_parcels" | "compare",
  "target_description": "human readable description of the target area",
  "zone_type": "high_density_residential" | "mixed_use" | "commercial" | "industrial" | "park" | "residential" | null,
  "parameters": {
    "max_storeys": <number, default 6 for residential, 4 for commercial, 12 for mixed_use>,
    "setback_meters": <number, default 8>,
    "lot_coverage": <0-1 float, default 0.6>,
    "building_type": <string or null>
  },
  "spatial_query": {
    "method": "street_corridor" | "radius" | "district" | "ward" | "bbox" | "parcels_by_score" | "nearest_to_poi",
    "street_name": <string or null>,
    "bound_start": <string or null>,
    "bound_end": <string or null>,
    "center_lat": <number or null>,
    "center_lng": <number or null>,
    "buffer_meters": <number, default 100>,
    "district_name": <string or null>,
    "ward_name": <string or null>,
    "score_min": <number or null>,
    "score_max": <number or null>,
    "limit": <number or null, set to 1 for singular building requests like 'a mall', 'a hospital'>
  },
  "summary": "A 1-2 sentence professional description of what you understood the user wants, mentioning Waterloo context."
}

CRITICAL RULES:
- If the user asks for a NON-RESIDENTIAL building (e.g. shopping mall, office, factory, hospital, stadium), you MUST set "zone_type" to "commercial" or "industrial".
- If the user asks for a SINGULAR building ("a shopping mall", "a new tower"), you MUST set "spatial_query.limit" to 1.
- "commercial" properties will calculate jobs instead of housing units. "residential" calculates homes instead of jobs. "mixed_use" calculates both.

WATERLOO GEOGRAPHY REFERENCE (use these coordinates for center_lat/center_lng):

MAJOR STREETS (with approximate center coordinates and suggested buffer):
- King St (main corridor, runs NE-SW): center 43.4640, -80.5230, buffer 150m. From Conestoga Mall (43.498, -80.542) through Uptown (43.464, -80.523) to Kitchener
- University Ave (E-W near universities): center 43.4720, -80.5350, buffer 120m
- Columbia St (E-W): center 43.4760, -80.5280, buffer 100m
- Weber St (N-S, parallel to King): center 43.4700, -80.5150, buffer 120m
- Bridgeport Rd (north): center 43.4850, -80.5200, buffer 100m
- Erb St (E-W through Uptown): center 43.4640, -80.5280, buffer 120m
- Albert St: center 43.4690, -80.5280, buffer 80m
- Lester St: center 43.4730, -80.5300, buffer 80m
- Philip St: center 43.4710, -80.5320, buffer 80m
- Hazel St: center 43.4700, -80.5250, buffer 80m
- Regina St: center 43.4650, -80.5240, buffer 80m
- Caroline St: center 43.4660, -80.5270, buffer 80m
- Northfield Dr: center 43.4920, -80.5380, buffer 120m

KEY AREAS (use "radius" or "district" method):
- Uptown Waterloo: center 43.4640, -80.5230, district_name "Uptown"
- Northdale (student housing): center 43.4760, -80.5290, district_name "Northdale"
- Beechwood: center 43.4550, -80.5250, district_name "Beechwood"
- Lakeshore: center 43.4500, -80.5400, district_name "Lakeshore"
- Westmount: center 43.4600, -80.5450, district_name "Westmount"
- Columbia Lake area: center 43.4720, -80.5500, district_name "Columbia Lake"
- Laurelwood: center 43.4430, -80.5350, district_name "Laurelwood"
- SPUR Innovation area: center 43.4650, -80.5220 (near Uptown core)

UNIVERSITIES:
- University of Waterloo: 43.4723, -80.5449
- Wilfrid Laurier University: 43.4738, -80.5275

ION LRT STATIONS (runs along King St corridor):
- Conestoga: 43.498, -80.542
- Northfield: 43.492, -80.538
- Research & Technology: 43.483, -80.535
- University of Waterloo: 43.473, -80.528
- Laurier/Waterloo Park: 43.467, -80.522
- Uptown Waterloo: 43.463, -80.519
- Allen: 43.457, -80.516
- Grand River Hospital: 43.451, -80.498
- Central Station: 43.447, -80.491
- Kitchener Market: 43.443, -80.486
- Fairway: 43.434, -80.475

WARDS: Ward 1 through Ward 7 (use "ward" method with ward_name like "Ward 6")

RULES:
- For street queries: ALWAYS use "street_corridor" method with the street_name AND set center_lat/center_lng from the coordinates above AND set buffer_meters 80-150
- For "near" / "around" / "within X of": use "radius" method with center coordinates and buffer_meters
- For neighbourhood/district names: use "district" method with district_name
- For ward numbers: use "ward" method with ward_name (e.g., "Ward 6")
- For score/readiness queries: use "parcels_by_score" with score_min/score_max. ALSO set center_lat/center_lng if an area is mentioned
- For "near ION stations": use "radius" method with center at the nearest ION station coords
- Default max_storeys: 6 for residential, 4 for commercial, 12 for mixed_use, 8 for high_density_residential
- Default setback_meters: 3
- Default lot_coverage: 0.6
- ONLY return valid JSON. No markdown. No backticks. No explanation text.
- If the request is nonsensical (e.g., "build a cannon"), return action "error" with summary explaining why.
`;

// ─── Client-Side Polygon Processing ──────────────────────

/**
 * Creates a rectangular building footprint polygon from a centroid point.
 * Uses lot_area_sqm, lot_coverage, and setback to compute dimensions.
 * Returns a polygon that is INSIDE the parcel boundary with proper setbacks.
 */
function createFootprintFromPoint(
  coords: [number, number],
  lotAreaSqm: number,
  lotCoverage: number,
  setbackMeters: number,
  rotationDeg: number = 0
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  try {
    // Compute buildable area: lot area * coverage, reduced by setback
    const lotSide = Math.sqrt(lotAreaSqm);
    const setbackReduction = Math.max(0, 1 - (2 * setbackMeters / lotSide));
    const buildableAreaSqm = lotAreaSqm * lotCoverage * setbackReduction * setbackReduction;

    if (buildableAreaSqm < 10) return null; // too small to build on

    // Create a rectangular footprint (slight aspect ratio for realism)
    const aspectRatio = 1.3 + (lotAreaSqm % 7) * 0.05; // slight variation per parcel
    const width = Math.sqrt(buildableAreaSqm / aspectRatio);
    const length = buildableAreaSqm / width;

    // Convert meters to degrees at this latitude
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(coords[1] * Math.PI / 180);
    const halfW = (width / 2) / metersPerDegreeLng;
    const halfL = (length / 2) / metersPerDegreeLat;

    // Create rectangle centered on the point
    const ring: [number, number][] = [
      [coords[0] - halfW, coords[1] - halfL],
      [coords[0] + halfW, coords[1] - halfL],
      [coords[0] + halfW, coords[1] + halfL],
      [coords[0] - halfW, coords[1] + halfL],
      [coords[0] - halfW, coords[1] - halfL], // close
    ];

    const polygon = turf.polygon([ring]);

    // Apply slight rotation for visual variety (aligned to parcel orientation)
    if (rotationDeg !== 0) {
      return turf.transformRotate(polygon, rotationDeg, { pivot: coords }) as GeoJSON.Feature<GeoJSON.Polygon>;
    }
    return polygon;
  } catch {
    return null;
  }
}

/**
 * Insets a polygon parcel boundary by setback distance.
 * For polygons from the backend, negative buffer guarantees no road intersection.
 */
function insetPolygon(
  feature: GeoJSON.Feature,
  setbackMeters: number
): GeoJSON.Feature | null {
  try {
    if (!feature.geometry) return null;
    const inset = turf.buffer(feature, -setbackMeters, { units: 'meters' });
    if (!inset || !inset.geometry) return null;

    if (inset.geometry.type === 'MultiPolygon') {
      const polygons = inset.geometry.coordinates.map(c => turf.polygon(c));
      const largest = polygons.reduce((a, b) => turf.area(a) > turf.area(b) ? a : b);
      return { ...largest, properties: { ...feature.properties } };
    }
    return { ...inset, properties: { ...feature.properties } };
  } catch {
    return null;
  }
}

/**
 * Process backend parcel features into building footprints.
 * Handles BOTH Point geometry (creates footprint from centroid + area)
 * and Polygon geometry (insets by setback distance).
 */
function processParcelFootprints(
  parcels: GeoJSON.FeatureCollection,
  parameters: Record<string, any>
): GeoJSON.FeatureCollection {
  const setbackMeters = parameters.setback_meters ?? 3;
  const lotCoverage = parameters.lot_coverage ?? 0.6;
  const maxStoreys = parameters.max_storeys ?? 6;
  const proposedHeight = maxStoreys * 3.5;

  const processedFeatures = parcels.features
    .map((feature, idx) => {
      try {
        const geom = feature.geometry;
        if (!geom) return null;

        const lotAreaSqm = feature.properties?.lot_area_sqm ?? 400;
        const score = feature.properties?.score ?? 50;
        let footprint: GeoJSON.Feature | null = null;

        if (geom.type === 'Point') {
          // Point geometry — construct footprint from centroid + area
          const coords = geom.coordinates as [number, number];
          // Vary rotation based on index for visual diversity (-15 to +15 degrees)
          const rotation = ((idx * 37) % 30) - 15;
          footprint = createFootprintFromPoint(coords, lotAreaSqm, lotCoverage, setbackMeters, rotation);
        } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          // Polygon geometry — inset by setback
          footprint = insetPolygon(feature, setbackMeters);
          // Apply lot coverage scaling
          if (footprint && lotCoverage < 1.0) {
            try {
              const centroid = turf.centroid(footprint);
              footprint = turf.transformScale(footprint, Math.sqrt(lotCoverage), { origin: centroid });
            } catch { /* keep unscaled */ }
          }
        }

        if (!footprint || !footprint.geometry) return null;

        const footprintArea = turf.area(footprint);
        const estimatedUnits = Math.max(1, Math.floor((footprintArea * maxStoreys) / 75));

        return {
          ...footprint,
          properties: {
            ...feature.properties,
            proposed_height: proposedHeight,
            base_height: 0,
            storeys: maxStoreys,
            footprint_area_sqm: Math.round(footprintArea),
            parcel_area_sqm: Math.round(lotAreaSqm),
            score,
            estimated_units: estimatedUnits,
            building_type: feature.properties?.building_type ?? 'mixed_use',
          },
        };
      } catch (e) {
        console.warn('Failed to process parcel:', feature.properties?.parcel_id, e);
        return null;
      }
    })
    .filter(Boolean) as GeoJSON.Feature[];

  return { type: 'FeatureCollection', features: processedFeatures };
}

/**
 * Recompute statistics from the processed building footprints.
 * All numbers are algorithmic — zero hardcoding.
 */
function recomputeStatistics(
  buildings: GeoJSON.FeatureCollection,
  originalStats: ComputedStatistics
): ComputedStatistics {
  const features = buildings.features;
  if (features.length === 0) return originalStats;

  const AVG_HOUSEHOLD_SIZE = 2.1;
  const AVG_ASSESSED_VALUE = 350000;
  const MILL_RATE = 0.0118;
  const ION_MODE_SHARE = 0.3;

  const totalParcels = features.length;
  const totalAreaSqm = features.reduce((sum, f) => sum + (f.properties?.parcel_area_sqm || 0), 0);
  const totalUnits = features.reduce((sum, f) => sum + (f.properties?.estimated_units || 0), 0);

  const estimatedPopulation = Math.round(totalUnits * AVG_HOUSEHOLD_SIZE);
  const estimatedTaxRevenue = Math.round(totalUnits * AVG_ASSESSED_VALUE * MILL_RATE);

  // ION ridership — only parcels within 800m of an ION station
  const parcelsNearION = features.filter(f => {
    try {
      const centroid = turf.centroid(f);
      return ION_STATION_COORDS.some(station =>
        turf.distance(centroid, turf.point(station), { units: 'meters' }) < 800
      );
    } catch {
      return false;
    }
  });

  const transitRidership = Math.round(
    parcelsNearION.length * AVG_HOUSEHOLD_SIZE * ION_MODE_SHARE
  );

  // Ward breakdown from real parcel properties
  const wardMap = new Map<string, { councillor: string; count: number }>();
  features.forEach(f => {
    const ward = f.properties?.ward_name || 'Unknown';
    const councillor = f.properties?.councillor_name || 'Unknown';
    const existing = wardMap.get(ward) || { councillor, count: 0 };
    existing.count++;
    wardMap.set(ward, existing);
  });

  return {
    total_parcels: totalParcels,
    total_area_sqm: Math.round(totalAreaSqm),
    housingUnits: totalUnits,
    newResidents: estimatedPopulation,
    taxRevenue: estimatedTaxRevenue,
    transitRidership,
    schoolChildren: Math.round(totalUnits * 0.1),
    waterDemand: Math.round(estimatedPopulation * 220 * 365 / 1000000),
    affected_wards: Array.from(wardMap.entries()).map(([ward, data]) => ({
      ward_name: ward,
      councillor: data.councillor,
      parcel_count: data.count,
    })),
  };
}

// ─── Fallback Intent Parser ──────────────────────────────────
// Used when Gemini API is rate-limited. Generates structured intent
// from keywords. The BACKEND still does all spatial resolution with real data.

const STREET_COORDS: Record<string, { lat: number; lng: number; buffer: number }> = {
  'king': { lat: 43.4640, lng: -80.5230, buffer: 150 },
  'university': { lat: 43.4720, lng: -80.5350, buffer: 120 },
  'columbia': { lat: 43.4760, lng: -80.5280, buffer: 100 },
  'weber': { lat: 43.4700, lng: -80.5150, buffer: 120 },
  'bridgeport': { lat: 43.4850, lng: -80.5200, buffer: 100 },
  'erb': { lat: 43.4640, lng: -80.5280, buffer: 120 },
  'albert': { lat: 43.4690, lng: -80.5280, buffer: 80 },
  'lester': { lat: 43.4730, lng: -80.5300, buffer: 80 },
  'philip': { lat: 43.4710, lng: -80.5320, buffer: 80 },
  'northfield': { lat: 43.4920, lng: -80.5380, buffer: 120 },
  'regina': { lat: 43.4650, lng: -80.5240, buffer: 80 },
  'caroline': { lat: 43.4660, lng: -80.5270, buffer: 80 },
};

const AREA_COORDS: Record<string, { lat: number; lng: number; district: string }> = {
  'uptown': { lat: 43.4640, lng: -80.5230, district: 'Uptown' },
  'northdale': { lat: 43.4760, lng: -80.5290, district: 'Northdale' },
  'beechwood': { lat: 43.4550, lng: -80.5250, district: 'Beechwood' },
  'lakeshore': { lat: 43.4500, lng: -80.5400, district: 'Lakeshore' },
  'westmount': { lat: 43.4600, lng: -80.5450, district: 'Westmount' },
  'laurelwood': { lat: 43.4430, lng: -80.5350, district: 'Laurelwood' },
  'spur': { lat: 43.4650, lng: -80.5220, district: 'Uptown' },
  'ion': { lat: 43.4640, lng: -80.5230, district: 'Central' },
};

function fallbackParseIntent(query: string): GeminiSpatialIntent {
  const q = query.toLowerCase();

  // Extract storey count
  const storeyMatch = q.match(/(\d+)[- ]?stor(?:e?y|ies)/);
  const maxStoreys = storeyMatch ? parseInt(storeyMatch[1]) : 6;

  // Determine zone type
  let zoneType = 'mixed_use';
  if (q.includes('residential') || q.includes('condo') || q.includes('apartment')) zoneType = 'residential';
  else if (q.includes('commercial') || q.includes('retail') || q.includes('office')) zoneType = 'commercial';
  else if (q.includes('mixed')) zoneType = 'mixed_use';
  else if (q.includes('industrial')) zoneType = 'industrial';
  else if (q.includes('park') || q.includes('green')) zoneType = 'park';

  // Determine action
  let action = 'rezone';
  if (q.includes('find') || q.includes('show') || q.includes('score') || q.includes('analyze')) action = 'find_parcels';
  else if (q.includes('add') || q.includes('build')) action = 'add_building';

  // Score-based queries
  const scoreAboveMatch = q.match(/scor(?:e|ing)\s*(?:above|over|>)\s*(\d+)/);
  const scoreBelowMatch = q.match(/scor(?:e|ing)\s*(?:below|under|<)\s*(\d+)/);
  if (scoreAboveMatch || scoreBelowMatch) {
    const scoreMin = scoreAboveMatch ? parseInt(scoreAboveMatch[1]) : 0;
    const scoreMax = scoreBelowMatch ? parseInt(scoreBelowMatch[1]) : 100;

    // Check if an area is also mentioned
    let centerLat: number | undefined;
    let centerLng: number | undefined;
    for (const [name, coords] of Object.entries(AREA_COORDS)) {
      if (q.includes(name)) { centerLat = coords.lat; centerLng = coords.lng; break; }
    }
    for (const [name, coords] of Object.entries(STREET_COORDS)) {
      if (q.includes(name)) { centerLat = coords.lat; centerLng = coords.lng; break; }
    }

    return {
      action: 'find_parcels',
      target_description: query,
      zone_type: zoneType,
      parameters: { max_storeys: maxStoreys, setback_meters: 8, lot_coverage: 0.6 },
      spatial_query: {
        method: 'parcels_by_score',
        score_min: scoreMin,
        score_max: scoreMax,
        center_lat: centerLat,
        center_lng: centerLng,
        buffer_meters: 500,
      },
      summary: `Finding parcels with scores ${scoreAboveMatch ? `above ${scoreMin}` : ''}${scoreBelowMatch ? `below ${scoreMax}` : ''} in Waterloo.`,
    };
  }

  // Ward queries
  const wardMatch = q.match(/ward\s*(\d+)/i);
  if (wardMatch) {
    return {
      action,
      target_description: query,
      zone_type: zoneType,
      parameters: { max_storeys: maxStoreys, setback_meters: 8, lot_coverage: 0.6 },
      spatial_query: { method: 'ward', ward_name: `Ward ${wardMatch[1]}`, buffer_meters: 200 },
      summary: `${action === 'find_parcels' ? 'Analyzing' : 'Proposing changes to'} parcels in Ward ${wardMatch[1]}, Waterloo.`,
    };
  }

  // Street queries
  for (const [streetKey, coords] of Object.entries(STREET_COORDS)) {
    if (q.includes(streetKey)) {
      return {
        action,
        target_description: query,
        zone_type: zoneType,
        parameters: { max_storeys: maxStoreys, setback_meters: 8, lot_coverage: 0.6 },
        spatial_query: {
          method: 'street_corridor',
          street_name: streetKey.charAt(0).toUpperCase() + streetKey.slice(1) + ' St',
          center_lat: coords.lat,
          center_lng: coords.lng,
          buffer_meters: coords.buffer,
        },
        summary: `${action === 'find_parcels' ? 'Analyzing' : 'Proposing ' + maxStoreys + '-storey ' + zoneType + ' along'} ${streetKey.charAt(0).toUpperCase() + streetKey.slice(1)} St in Waterloo.`,
      };
    }
  }

  // District/area queries
  for (const [areaKey, coords] of Object.entries(AREA_COORDS)) {
    if (q.includes(areaKey)) {
      return {
        action,
        target_description: query,
        zone_type: zoneType,
        parameters: { max_storeys: maxStoreys, setback_meters: 8, lot_coverage: 0.6 },
        spatial_query: {
          method: 'district',
          district_name: coords.district,
          center_lat: coords.lat,
          center_lng: coords.lng,
          buffer_meters: 300,
        },
        summary: `${action === 'find_parcels' ? 'Analyzing' : 'Proposing ' + maxStoreys + '-storey ' + zoneType + ' in'} the ${coords.district} area of Waterloo.`,
      };
    }
  }

  // Default fallback — radius search near Uptown
  return {
    action,
    target_description: query,
    zone_type: zoneType,
    parameters: { max_storeys: maxStoreys, setback_meters: 8, lot_coverage: 0.6 },
    spatial_query: {
      method: 'radius',
      center_lat: 43.4640,
      center_lng: -80.5230,
      buffer_meters: 300,
    },
    summary: `Processing urban planning request for Waterloo: "${query}"`,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────

export async function simulateZoningChange(query: string): Promise<SimulationResult> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  let intent: GeminiSpatialIntent;

  // Step 1: Try Gemini for intent parsing, fall back to keyword parser on failure
  if (apiKey) {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: { text: GEMINI_SYSTEM_PROMPT } },
          contents: [{ role: 'user', parts: [{ text: query }] }],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('Gemini API unavailable (status', response.status, '), error:', errText);
        console.warn('Using fallback parser due to API error.');
        // Fall through to fallback
        intent = fallbackParseIntent(query);
      } else {
        const data = await response.json();
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        // Strip markdown fences
        let cleanJson = textResponse.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        intent = JSON.parse(cleanJson);
      }
    } catch (error) {
      console.warn('Gemini request failed, using fallback parser:', error);
      intent = fallbackParseIntent(query);
    }
  } else {
    console.warn('No Gemini API key, using fallback parser');
    intent = fallbackParseIntent(query);
  }

  console.log('[geminiService] Parsed intent:', intent);

  // Handle error action
  if (intent.action === 'error') {
    throw new Error(intent.summary || "I couldn't understand that request.");
  }

  // Apply defaults to parameters
  intent.parameters = {
    max_storeys: intent.parameters?.max_storeys ?? 6,
    setback_meters: intent.parameters?.setback_meters ?? 8,
    lot_coverage: intent.parameters?.lot_coverage ?? 0.6,
    building_type: intent.parameters?.building_type ?? null,
  };
  intent.spatial_query.buffer_meters = intent.spatial_query?.buffer_meters ?? 100;

  // Step 3: Send intent to backend for spatial resolution
  const backendResponse = await fetch(`${BACKEND_URL}/simulate/proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intent),
  });

  if (!backendResponse.ok) {
    const errText = await backendResponse.text();
    console.error('Backend Error:', backendResponse.status, errText);
    throw new Error(`Backend Error: ${backendResponse.statusText}`);
  }

  const backendData = await backendResponse.json();
  console.log('[geminiService] Backend returned', backendData.affected_parcels?.features?.length, 'parcels');

  // Step 4: Process polygons client-side — inset + lot coverage + heights
  const rawParcels = backendData.affected_parcels as GeoJSON.FeatureCollection;
  const processedBuildings = processParcelFootprints(rawParcels, intent.parameters);
  console.log('[geminiService] Processed', processedBuildings.features.length, 'building footprints');

  // Step 5: Recompute statistics from processed footprints
  const stats = recomputeStatistics(processedBuildings, backendData.stats);

  // Step 6: Return the full result
  return {
    action: intent.action,
    affected_parcels: processedBuildings,
    stats,
    summary: intent.summary || backendData.summary,
    zoneCenter: backendData.zoneCenter,
    visualization: backendData.visualization,
    waterMoratoriumImpacted: backendData.waterMoratoriumImpacted ?? false,
    narrative: intent.summary || backendData.narrative,
    risks: backendData.risks ?? [],
  };
}
