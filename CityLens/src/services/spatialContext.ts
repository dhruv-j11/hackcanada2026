// Queries OpenStreetMap Overpass API to get real-world spatial context
// around a coordinate so we can place buildings on empty lots only.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export interface SpatialContext {
  existingBuildings: Array<{ coordinates: [number, number][]; height: number }>;
  parkingLots: Array<{ coordinates: [number, number][] }>;
  roads: Array<{ coordinates: [number, number][] }>;
}

/**
 * Fetches existing buildings, parking lots, and roads
 * within a given radius of the center coordinate.
 */
export async function fetchSpatialContext(
  lng: number,
  lat: number,
  radiusMeters: number = 400
): Promise<SpatialContext> {
  const query = `
    [out:json][timeout:10];
    (
      way["building"](around:${radiusMeters},${lat},${lng});
      way["amenity"="parking"](around:${radiusMeters},${lat},${lng});
      way["parking"="surface"](around:${radiusMeters},${lat},${lng});
      way["landuse"="retail"](around:${radiusMeters},${lat},${lng});
      way["landuse"="commercial"](around:${radiusMeters},${lat},${lng});
      way["landuse"="garages"](around:${radiusMeters},${lat},${lng});
      way["highway"](around:${radiusMeters},${lat},${lng});
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
    return { existingBuildings: [], parkingLots: [], roads: [] };
  }
}

function parseOverpassResponse(data: any): SpatialContext {
  const nodes: Record<string, { lat: number; lon: number }> = {};
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
    }
  }

  const existingBuildings: SpatialContext['existingBuildings'] = [];
  const parkingLots: SpatialContext['parkingLots'] = [];
  const roads: SpatialContext['roads'] = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags) continue;

    const coords: [number, number][] = el.nodes
      .map((nid: number) => nodes[nid])
      .filter(Boolean)
      .map((n: { lat: number; lon: number }) => [n.lon, n.lat] as [number, number]);

    if (coords.length < 2) continue;

    if (el.tags.building) {
      const heightStr = el.tags['building:levels'] || el.tags.height;
      let height = 10;
      if (heightStr) {
        const parsed = parseFloat(heightStr);
        if (!isNaN(parsed)) {
          height = el.tags['building:levels'] ? parsed * 3.5 : parsed;
        }
      }
      existingBuildings.push({ coordinates: coords, height });
    } else if (el.tags.highway) {
      roads.push({ coordinates: coords });
    } else if (
      el.tags.amenity === 'parking' ||
      el.tags.parking === 'surface' ||
      el.tags.landuse === 'retail' ||
      el.tags.landuse === 'commercial' ||
      el.tags.landuse === 'garages'
    ) {
      if (coords.length >= 3) {
        parkingLots.push({ coordinates: coords });
      }
    }
  }

  return { existingBuildings, parkingLots, roads };
}
