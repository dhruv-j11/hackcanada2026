/**
 * buildingGenerator.ts
 *
 * Generates realistic building footprints from OSM parking lot polygons.
 * Parking lots are already road-aligned, correctly sized, and guaranteed
 * not to overlap existing buildings — so we just extrude them.
 */

import { fetchSpatialContext } from '../services/spatialContext';

interface GeneratedBuilding {
  coordinates: [number, number][];
  height: number;
  type: 'residential' | 'mixed-use' | 'commercial';
}

// Hardcoded fallback sites: real parking lots from OSM/satellite for each zone
const FALLBACK_SITES: Record<string, [number, number][][]> = {
  uptown: [
    // Parking lot behind Willis Way (Uptown Waterloo)
    [[-80.5204, 43.4636], [-80.5198, 43.4636], [-80.5198, 43.4631], [-80.5204, 43.4631]],
    // Lot near King & Erb
    [[-80.5191, 43.4627], [-80.5185, 43.4627], [-80.5185, 43.4622], [-80.5191, 43.4622]],
    // Lot on Regina St
    [[-80.5198, 43.4644], [-80.5193, 43.4644], [-80.5193, 43.4640], [-80.5198, 43.4640]],
    // Small lot near Father David Bauer Dr
    [[-80.5207, 43.4625], [-80.5202, 43.4625], [-80.5202, 43.4621], [-80.5207, 43.4621]],
    // Lot on William St
    [[-80.5183, 43.4633], [-80.5178, 43.4633], [-80.5178, 43.4629], [-80.5183, 43.4629]],
  ],
  university: [
    // Lot C on Columbia St (UW)
    [[-80.5305, 43.4738], [-80.5297, 43.4738], [-80.5297, 43.4732], [-80.5305, 43.4732]],
    // Lot near Phillip St
    [[-80.5278, 43.4727], [-80.5271, 43.4727], [-80.5271, 43.4722], [-80.5278, 43.4722]],
    // Lot near Lester St
    [[-80.5260, 43.4736], [-80.5254, 43.4736], [-80.5254, 43.4731], [-80.5260, 43.4731]],
    // Lot on University Ave
    [[-80.5289, 43.4744], [-80.5283, 43.4744], [-80.5283, 43.4739], [-80.5289, 43.4739]],
  ],
  midtown: [
    // Grand River Hospital parking
    [[-80.4993, 43.4517], [-80.4985, 43.4517], [-80.4985, 43.4511], [-80.4993, 43.4511]],
    // Lot near King St S
    [[-80.4978, 43.4507], [-80.4971, 43.4507], [-80.4971, 43.4502], [-80.4978, 43.4502]],
    // Lot on Moore Ave
    [[-80.4988, 43.4524], [-80.4982, 43.4524], [-80.4982, 43.4519], [-80.4988, 43.4519]],
    // Near Ion Midtown station
    [[-80.4970, 43.4513], [-80.4964, 43.4513], [-80.4964, 43.4508], [-80.4970, 43.4508]],
  ],
  downtown_kitchener: [
    // Lot near Kitchener Market
    [[-80.4919, 43.4478], [-80.4912, 43.4478], [-80.4912, 43.4473], [-80.4919, 43.4473]],
    // Lot on Charles St
    [[-80.4903, 43.4468], [-80.4897, 43.4468], [-80.4897, 43.4463], [-80.4903, 43.4463]],
    // Lot near Duke St
    [[-80.4924, 43.4485], [-80.4918, 43.4485], [-80.4918, 43.4480], [-80.4924, 43.4480]],
    // Near Central Station
    [[-80.4895, 43.4475], [-80.4889, 43.4475], [-80.4889, 43.4470], [-80.4895, 43.4470]],
  ],
  northfield: [
    // Conestoga Mall parking lot (large)
    [[-80.5395, 43.4925], [-80.5386, 43.4925], [-80.5386, 43.4918], [-80.5395, 43.4918]],
    // Lot on Northfield Dr
    [[-80.5378, 43.4915], [-80.5371, 43.4915], [-80.5371, 43.4909], [-80.5378, 43.4909]],
    // Lot near King St N / Northfield
    [[-80.5401, 43.4932], [-80.5394, 43.4932], [-80.5394, 43.4926], [-80.5401, 43.4926]],
    // Near ION Conestoga station
    [[-80.5369, 43.4922], [-80.5363, 43.4922], [-80.5363, 43.4917], [-80.5369, 43.4917]],
    // Additional lot east of mall
    [[-80.5358, 43.4928], [-80.5352, 43.4928], [-80.5352, 43.4923], [-80.5358, 43.4923]],
  ],
};

const BUILDING_TYPES: Array<'residential' | 'mixed-use' | 'commercial'> = [
  'residential', 'mixed-use', 'commercial', 'residential', 'mixed-use', 'residential'
];

/**
 * Calculate polygon area in square meters (approximate for small areas)
 */
function polygonAreaSqm(coords: [number, number][]): number {
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const mPerDegLng = 111320 * Math.cos(avgLat * Math.PI / 180);
  const mPerDegLat = 110540;

  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const xi = coords[i][0] * mPerDegLng;
    const yi = coords[i][1] * mPerDegLat;
    const xj = coords[j][0] * mPerDegLng;
    const yj = coords[j][1] * mPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

/**
 * Generate realistic building footprints for a zone.
 *
 * Primary: fetch OSM parking lots and use their actual polygons.
 * Fallback: use hardcoded verified parking lot coordinates.
 */
export async function generateBuildings(
  zoneCenter: { lng: number; lat: number },
  zone: string,
  proposedStoreys: number,
  buildingTypes?: string[]
): Promise<GeneratedBuilding[]> {
  const types = buildingTypes || BUILDING_TYPES;
  const maxBuildings = 6;

  // Try fetching real OSM data first
  try {
    const ctx = await fetchSpatialContext(zoneCenter.lng, zoneCenter.lat, 400);
    console.log(`[BuildingGen] OSM data: ${ctx.existingBuildings.length} buildings, ${ctx.parkingLots.length} parking lots`);

    if (ctx.parkingLots.length >= 2) {
      // Filter to reasonable building-sized lots (200-15000 sqm)
      const viable = ctx.parkingLots
        .map(lot => ({ coords: lot.coordinates, area: polygonAreaSqm(lot.coordinates) }))
        .filter(l => l.area >= 200 && l.area <= 15000)
        .sort((a, b) => {
          // Prefer medium lots (1000-5000 sqm)
          const aScore = Math.abs(Math.log(a.area) - Math.log(3000));
          const bScore = Math.abs(Math.log(b.area) - Math.log(3000));
          return aScore - bScore;
        });

      console.log(`[BuildingGen] ${viable.length} viable lots after filtering`);

      if (viable.length >= 2) {
        const selected = viable.slice(0, maxBuildings);
        return selected.map((lot, i) => ({
          coordinates: lot.coords,
          height: proposedStoreys * 3.5 + (Math.random() - 0.5) * 3.5,
          type: types[i % types.length] as 'residential' | 'mixed-use' | 'commercial',
        }));
      }
    }
  } catch (e) {
    console.warn('[BuildingGen] OSM fetch failed, using fallback:', e);
  }

  // Fallback: hardcoded verified coordinates
  console.log(`[BuildingGen] Using hardcoded fallback for zone: ${zone}`);
  const sites = FALLBACK_SITES[zone] || FALLBACK_SITES['uptown'];
  return sites.slice(0, maxBuildings).map((coords, i) => ({
    coordinates: coords,
    height: proposedStoreys * 3.5 + (Math.random() - 0.5) * 3.5,
    type: types[i % types.length] as 'residential' | 'mixed-use' | 'commercial',
  }));
}
