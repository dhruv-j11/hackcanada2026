import { generateBuildings } from '../utils/buildingGenerator';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface BuildingFootprint {
  coordinates: [number, number][];
  height: number;
  type: 'residential' | 'mixed-use' | 'commercial';
}

export interface SimulationResult {
  zone: string;
  proposedHeight: number;
  proposedUse: string;
  stats: {
    housingUnits: number;
    newResidents: number;
    taxRevenue: number;
    waterDemand: number;
    transitRidership: number;
    schoolChildren: number;
  };
  waterMoratoriumImpacted: boolean;
  narrative: string;
  risks: string[];
  buildingFootprints: BuildingFootprint[];
  zoneCenter?: { lng: number, lat: number };
}

// Fallback data if Gemini fails or key is missing
const fallbackResult: SimulationResult = {
  zone: "uptown",
  proposedHeight: 6,
  proposedUse: "mixed-use residential",
  stats: {
    housingUnits: 840,
    newResidents: 1680,
    taxRevenue: 2100000,
    waterDemand: 135,
    transitRidership: 336,
    schoolChildren: 84
  },
  waterMoratoriumImpacted: true,
  narrative: "Rezoning the Uptown Waterloo area to 6-storey mixed use would add approximately 840 housing units along the ION corridor. This provides much-needed density but puts additional strain on the already-affected water infrastructure.",
  risks: ["Water moratorium zone — requires infrastructure investment", "Parking minimum variances needed"],
  buildingFootprints: [
    { coordinates: [[-80.5210, 43.4640], [-80.5195, 43.4640], [-80.5195, 43.4625], [-80.5210, 43.4625]], height: 21, type: "residential" },
    { coordinates: [[-80.5193, 43.4640], [-80.5178, 43.4640], [-80.5178, 43.4628], [-80.5193, 43.4628]], height: 18, type: "mixed-use" },
    { coordinates: [[-80.5210, 43.4623], [-80.5195, 43.4623], [-80.5195, 43.4612], [-80.5210, 43.4612]], height: 24, type: "residential" }
  ]
};

const ZONES = {
  "uptown": { lng: -80.5190, lat: 43.4630 },
  "university": { lng: -80.5283, lat: 43.4731 },
  "midtown": { lng: -80.4980, lat: 43.4510 },
  "downtown_kitchener": { lng: -80.4908, lat: 43.4472 },
  "northfield": { lng: -80.5384, lat: 43.4919 }
};

export async function simulateZoningChange(query: string): Promise<SimulationResult> {
  const systemPrompt = `You are CityLens AI, an urban planning simulator for Waterloo, Ontario, Canada.

Context about Waterloo:
- Population: 155,550 (including 33,610 students)
- The ION LRT runs north-south through the city with 19 stations
- The Region of Waterloo FROZE new development approvals in January 2026 due to water capacity concerns
- Average water consumption: 220 litres per person per day
- Average property tax revenue per residential unit: ~$2,500/year
- Average persons per high-density unit: 1.8-2.0
- ION LRT daily ridership: ~12,000 total, roughly 600-800 per station
- New high-density development generates roughly 0.3-0.5 transit trips per unit per day
- Average school-age children per 100 high-density units: ~8-12
- Current zoning allows 4 storeys as-of-right in low-density zones (Housing Accelerator Fund changes)
- Each storey is approximately 3.5 meters

You have 5 pre-defined simulation zones along the ION corridor:
1. "uptown" — Uptown Waterloo (King St & Willis Way area). Center: [-80.5190, 43.4630]. Currently mixed commercial/residential, 2-4 storeys.
2. "university" — University of Waterloo / Columbia St corridor. Center: [-80.5283, 43.4731]. Currently low-density residential near campus.
3. "midtown" — Grand River Hospital / Midtown area. Center: [-80.4980, 43.4510]. Low-density residential with large parking lots.
4. "downtown_kitchener" — Central Station / Downtown Kitchener. Center: [-80.4908, 43.4472]. Mixed use, some high-rise already.
5. "northfield" — Northfield Dr near Conestoga Mall. Center: [-80.5384, 43.4919]. Commercial/big box retail with large surface lots.

When the user asks about a zoning change, you MUST respond with ONLY a JSON object (no markdown, no backticks, no explanation) in this exact format:
{
  "zone": "uptown",
  "proposedHeight": 6,
  "proposedUse": "mixed-use residential",
  "stats": {
    "housingUnits": 840,
    "newResidents": 1680,
    "taxRevenue": 2100000,
    "waterDemand": 135,
    "transitRidership": 336,
    "schoolChildren": 84
  },
  "waterMoratoriumImpacted": true,
  "narrative": "Rezoning the Uptown Waterloo area to 6-storey mixed use would add approximately 840 housing units...",
  "risks": ["Water moratorium zone — requires infrastructure investment", "Parking minimum variances needed"],
  "buildingFootprints": [
    {
      "coordinates": [[-80.5210, 43.4640], [-80.5195, 43.4640], [-80.5195, 43.4625], [-80.5210, 43.4625]],
      "height": 21,
      "type": "residential"
    }
  ]
}

CRITICAL RULES:
- Calculate stats realistically using the context provided. Do NOT make up random numbers.
- housingUnits: estimate based on zone area, proposed height, and ~65 sqm per unit with 70% efficiency
- newResidents: housingUnits * 2.0
- taxRevenue: housingUnits * 2500
- waterDemand: newResidents * 220 * 365 / 1000000 (megalitres per year)
- transitRidership: housingUnits * 0.4 (trips per day)
- schoolChildren: housingUnits * 0.1
- waterMoratoriumImpacted: true for all zones (the entire high-growth area is affected)
- buildingFootprints: generate 3-6 realistic building footprint polygons near the zone center. Each building should be a slightly different size and height. Make the coordinates form realistic rectangular building shapes (not squares — real buildings are rectangular). Vary heights between (proposedHeight - 1) * 3.5 and (proposedHeight + 1) * 3.5 meters for visual variety.
- The narrative should be 2-3 sentences, professional but clear, mentioning specific Waterloo context.
- If the query is vague or doesn't match a zone, pick the most relevant zone and explain your reasoning in the narrative.
`;

  // Determine which zone this query targets so we can fetch spatial data
  let targetZone = 'uptown';
  const q = query.toLowerCase();
  if (q.includes('university') || q.includes('campus') || q.includes('density near ion')) targetZone = 'university';
  else if (q.includes('midtown') || q.includes('hospital')) targetZone = 'midtown';
  else if (q.includes('downtown') || q.includes('kitchener')) targetZone = 'downtown_kitchener';
  else if (q.includes('northfield') || q.includes('mall') || q.includes('conestoga')) targetZone = 'northfield';
  
  const zoneCenter = ZONES[targetZone as keyof typeof ZONES];

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("No Gemini API key found. Using mock data. Set VITE_GEMINI_API_KEY in .env");
    const mocked = { ...fallbackResult };
    mocked.zone = targetZone;
    if (targetZone === 'university') {
      mocked.narrative = "Adding high density around University stations significantly boosts transit viability, though parking minimums will need careful review.";
    } else if (targetZone === 'midtown') {
      mocked.narrative = "Midtown intensification is heavily impacted by the water moratorium. Any 6+ storey additions will be frozen until infrastructure expands.";
    } else if (targetZone === 'northfield') {
      mocked.narrative = "Densifying the Northfield corridor transforms retail surface parking into mixed-use communities, taking advantage of the mall terminal.";
    }
    mocked.zoneCenter = zoneCenter;
    // Generate buildings from OSM data (or fallback coordinates)
    const buildings = await generateBuildings(zoneCenter, targetZone, mocked.proposedHeight);
    mocked.buildingFootprints = buildings;
    return mocked;
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: { text: systemPrompt } },
        contents: [{ role: 'user', parts: [{ text: query }] }],
        generationConfig: {
            temperature: 0.2,
            response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const textResponse = data.candidates[0].content.parts[0].text;

    let cleanJson = textResponse;
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/```json\n?/, '').replace(/```\n?$/, '');
    }

    const result = JSON.parse(cleanJson) as SimulationResult;
    result.zoneCenter = ZONES[result.zone as keyof typeof ZONES] || ZONES["uptown"];

    // Override Gemini's building footprints with programmatically generated ones
    const buildings = await generateBuildings(result.zoneCenter, result.zone, result.proposedHeight);
    result.buildingFootprints = buildings;

    return result;
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    const fallback = { ...fallbackResult };
    fallback.zoneCenter = ZONES["uptown"];
    // Generate buildings for fallback too
    const buildings = await generateBuildings(fallback.zoneCenter!, fallback.zone, fallback.proposedHeight);
    fallback.buildingFootprints = buildings;
    return fallback;
  }
}
