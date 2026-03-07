// Queries OpenStreetMap Overpass API to get real-world spatial context 
// around a coordinate so Gemini can place buildings in empty lots only.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export interface SpatialContext {
  existingBuildings: Array<{ coordinates: [number, number][]; height: number }>;
  parkingLots: Array<{ coordinates: [number, number][] }>;
  roads: Array<{ coordinates: [number, number][] }>;
  emptyLots: Array<{ coordinates: [number, number][] }>;
}

/**
 * Fetches existing buildings, parking lots, roads, and empty lots
 * within a ~300m radius of the given center coordinate.
 * Returns simplified GeoJSON-like coordinate arrays for each feature.
 */
export async function fetchSpatialContext(
  lng: number, 
  lat: number, 
  radiusMeters: number = 300
): Promise<SpatialContext> {
  // Overpass QL: get buildings, parking, roads within radius
  const query = `
    [out:json][timeout:10];
    (
      way["building"](around:${radiusMeters},${lat},${lng});
      way["amenity"="parking"](around:${radiusMeters},${lat},${lng});
      way["landuse"="retail"](around:${radiusMeters},${lat},${lng});
      way["landuse"="commercial"](around:${radiusMeters},${lat},${lng});
      relation["building"](around:${radiusMeters},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

    const data = await response.json();
    return parseOverpassResponse(data);
  } catch (error) {
    console.warn("Overpass API failed, returning empty context:", error);
    return { existingBuildings: [], parkingLots: [], roads: [], emptyLots: [] };
  }
}

function parseOverpassResponse(data: any): SpatialContext {
  // Build a node lookup table
  const nodes: Record<string, { lat: number; lon: number }> = {};
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
    }
  }

  const existingBuildings: SpatialContext['existingBuildings'] = [];
  const parkingLots: SpatialContext['parkingLots'] = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags) continue;

    const coords: [number, number][] = el.nodes
      .map((nid: number) => nodes[nid])
      .filter(Boolean)
      .map((n: { lat: number; lon: number }) => [n.lon, n.lat] as [number, number]);

    if (coords.length < 3) continue;

    if (el.tags.building) {
      const heightStr = el.tags['building:levels'] || el.tags.height;
      let height = 10; // default 
      if (heightStr) {
        const parsed = parseFloat(heightStr);
        if (!isNaN(parsed)) {
          // If it's levels, multiply by ~3.5m
          height = el.tags['building:levels'] ? parsed * 3.5 : parsed;
        }
      }
      existingBuildings.push({ coordinates: coords, height });
    } else if (el.tags.amenity === 'parking' || el.tags.landuse === 'retail' || el.tags.landuse === 'commercial') {
      parkingLots.push({ coordinates: coords });
    }
  }

  return {
    existingBuildings,
    parkingLots,
    roads: [], // roads are less critical for placement
    emptyLots: parkingLots // parking lots and commercial land = best candidates for redevelopment
  };
}

/**
 * Creates a compact text summary of the spatial context
 * that can be injected into the Gemini prompt so it places
 * buildings only on empty/parking lots and avoids existing structures.
 */
export function summarizeSpatialContext(ctx: SpatialContext, lng: number, lat: number): string {
  const lines: string[] = [];
  lines.push(`SPATIAL CONTEXT around [${lng.toFixed(4)}, ${lat.toFixed(4)}]:`);
  lines.push(`Found ${ctx.existingBuildings.length} existing buildings nearby.`);
  
  if (ctx.existingBuildings.length > 0) {
    // Send up to 15 building bounding boxes as occupied zones
    const sample = ctx.existingBuildings.slice(0, 15);
    lines.push(`OCCUPIED ZONES (do NOT place buildings here):`);
    for (const b of sample) {
      const minLng = Math.min(...b.coordinates.map(c => c[0]));
      const maxLng = Math.max(...b.coordinates.map(c => c[0]));
      const minLat = Math.min(...b.coordinates.map(c => c[1]));
      const maxLat = Math.max(...b.coordinates.map(c => c[1]));
      lines.push(`  Building: [${minLng.toFixed(5)},${minLat.toFixed(5)}] to [${maxLng.toFixed(5)},${maxLat.toFixed(5)}], height: ${b.height}m`);
    }
  }

  if (ctx.parkingLots.length > 0) {
    lines.push(`DEVELOPABLE SITES (parking lots / commercial land — place buildings HERE):`);
    for (const lot of ctx.parkingLots.slice(0, 8)) {
      const simplified = lot.coordinates.slice(0, 5).map(c => `[${c[0].toFixed(5)},${c[1].toFixed(5)}]`);
      lines.push(`  Lot polygon: ${simplified.join(', ')}`);
    }
  } else {
    lines.push(`No obvious parking lots or vacant land found. Place buildings in gaps between existing buildings, ensuring no overlap.`);
  }

  lines.push(`CRITICAL: Your buildingFootprints coordinates must NOT overlap any OCCUPIED ZONE listed above.`);
  lines.push(`Place proposed buildings ONLY on developable sites or in clear gaps.`);
  
  return lines.join('\n');
}
