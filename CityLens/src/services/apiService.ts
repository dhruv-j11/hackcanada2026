// CityLens Backend API Service
// Base URL for the FastAPI backend
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : 'http://155.138.136.112:8000';

// ─── Type Definitions ──────────────────────────────────────────

export interface ContributingFeature {
  feature: string;
  contribution: number;
}

export interface ParcelProperties {
  parcel_id: string;
  score: number;
  tier: string;
  tier_color: string;
  top_3_contributing_features: ContributingFeature[];
  address: string;
  lot_area_sqm: number;
  zoning_class: string;
  building_age: number;
  ward_number: number;
  ward_name: string;
  councillor_name: string;
  heritage_adjacent: boolean;
  nearest_heritage_name: string | null;
  heritage_distance_m: number | null;
  cluster_id: number;
  cluster_name: string;
  district_name: string;
  census_district_name: string;
}

export interface ParcelFeature {
  type: 'Feature';
  properties: ParcelProperties;
  geometry: GeoJSON.Geometry;
}

export interface ParcelScoresResponse {
  type: 'FeatureCollection';
  features: ParcelFeature[];
  metadata: {
    total_returned: number;
    total_parcels: number;
    bbox: string;
  };
}

export interface DistrictContext {
  district: string;
  population: number;
  median_age: number;
  owner_pct: number;
  renter_pct: number;
  core_housing_need_pct: number;
  median_household_income: number;
  top_industries: [string, Record<string, unknown>][];
}

export interface ParcelExplanation {
  score: number;
  tier: string;
  explanation: string;
  features: Record<string, number>;
  top_3_contributing_features: ContributingFeature[];
  parcel_id: string;
  ward: string;
  councillor: string;
  heritage_note: string | null;
  cluster_name: string;
  district_name: string;
  census_district_name: string;
  district_context: DistrictContext | null;
  constraints?: string[];
  unlock_suggestions?: string[];
  strengths?: string[];
  risks?: string[];
}

export interface WardAffected {
  ward: string;
  councillor: string;
  parcels: number;
}

export interface TopParcel {
  parcel_id: string;
  address: string;
  score: number;
}

export interface AreaAnalysis {
  bbox: number[];
  total_parcels: number;
  tier_breakdown: Record<string, number>;
  cluster_breakdown: Record<string, number>;
  avg_score: number;
  total_lot_area_sqm: number;
  estimated_additional_units: number;
  estimated_population_increase: number;
  estimated_annual_tax_revenue: number;
  estimated_ion_ridership_daily: number;
  constraints_summary: Record<string, number>;
  wards_affected: WardAffected[];
  top_10_parcels: TopParcel[];
}

export interface ClusterInfo {
  cluster_id: number;
  cluster_name: string;
  parcel_count: number;
  avg_score: number;
  dominant_features: string[];
  description: string;
  centroid?: Record<string, number>;
}

export interface CategoryProfile {
  category: string;
  description: string;
  keywords: string[];
  example_prompts: string[];
  weights: Record<string, number>;
}

export interface DistrictInfo {
  name: string;
  parcel_count: number;
  avg_score: number;
  census_available: boolean;
}

export interface DistrictDemographics {
  district: string;
  population: number;
  median_age: number;
  total_households: number;
  tenure: {
    owner: { count: number; percent: number };
    renter: { count: number; percent: number };
  };
  core_housing_need_pct: number;
  median_household_income: number;
  unemployment_rate: number;
  top_industries: [string, Record<string, unknown>][];
  dwelling_types: Record<string, number>;
  [key: string]: unknown;
}

export interface IonSimulationResult {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: ParcelProperties & {
      score_delta: number;
      old_score: number;
    };
    geometry: GeoJSON.Geometry;
  }>;
  summary?: {
    tier_changes: Record<string, number>;
    top_20_most_improved: Array<{ parcel_id: string; address: string; old_score: number; new_score: number; delta: number }>;
    avg_score_before: number;
    avg_score_after: number;
  };
}

export interface ImpactAnalysis {
  parcel: Record<string, unknown>;
  proposed_change: string;
  district: string;
  analysis: string;
  census_context: DistrictDemographics;
}

export interface AreaBrief {
  brief_text: string;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: string;
  parcel_count: number;
  cluster_count: number;
  ward_coverage: number;
  heritage_adjacent_count: number;
  district_coverage: number;
  unique_districts: number;
  census_loaded: boolean;
  census_districts: number;
}

// ─── API Functions ─────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/** Fetch all parcel scores as GeoJSON — main map data source */
export async function fetchParcelScores(params?: {
  bbox?: string;
  cluster?: string;
  district?: string;
  heritage_adjacent?: boolean;
}): Promise<ParcelScoresResponse> {
  const searchParams = new URLSearchParams();
  if (params?.bbox) searchParams.set('bbox', params.bbox);
  if (params?.cluster) searchParams.set('cluster', params.cluster);
  if (params?.district) searchParams.set('district', params.district);
  if (params?.heritage_adjacent !== undefined) searchParams.set('heritage_adjacent', String(params.heritage_adjacent));
  const qs = searchParams.toString();
  return apiFetch<ParcelScoresResponse>(`/parcels/scores${qs ? `?${qs}` : ''}`);
}

/** Fetch full explanation for a single parcel */
export async function fetchParcelExplanation(parcelId: string): Promise<ParcelExplanation> {
  return apiFetch<ParcelExplanation>(`/parcels/${parcelId}/explain`);
}

/** Rescore all parcels by development category */
export async function rescoreByCategory(category: string): Promise<unknown> {
  return apiFetch('/parcels/rescore-by-category', {
    method: 'POST',
    body: JSON.stringify({ category }),
  });
}

/** Fetch all category definitions */
export async function fetchCategories(): Promise<{ categories: CategoryProfile[] }> {
  return apiFetch('/parcels/categories');
}

/** Fetch cluster archetypes */
export async function fetchClusters(): Promise<{ clusters: ClusterInfo[] }> {
  return apiFetch('/parcels/clusters');
}

/** Aggregate analysis for a drawn bbox */
export async function fetchAreaAnalysis(bbox: string): Promise<AreaAnalysis> {
  return apiFetch<AreaAnalysis>(`/area/analyze?bbox=${bbox}`);
}

/** Generate community development brief */
export async function createAreaBrief(data: { bbox?: number[]; parcel_ids?: string[] }): Promise<AreaBrief> {
  return apiFetch<AreaBrief>('/area/brief', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Simulate a hypothetical new ION station */
export async function simulateIonStation(latitude: number, longitude: number): Promise<IonSimulationResult> {
  return apiFetch<IonSimulationResult>('/simulate/ion-station', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  });
}

/** AI-powered impact analysis for a parcel */
export async function fetchImpactAnalysis(parcelId: string, proposedChange: string): Promise<ImpactAnalysis> {
  return apiFetch<ImpactAnalysis>('/analyze/impact', {
    method: 'POST',
    body: JSON.stringify({ parcel_id: parcelId, proposed_change: proposedChange }),
  });
}

/** List all planning districts */
export async function fetchDistricts(): Promise<DistrictInfo[]> {
  return apiFetch<DistrictInfo[]>('/districts');
}

/** Full census demographics for a district */
export async function fetchDistrictDemographics(name: string): Promise<DistrictDemographics> {
  return apiFetch<DistrictDemographics>(`/district/${encodeURIComponent(name)}/demographics`);
}

/** Nearby building permits */
export async function fetchNearbyPermits(
  lat: number,
  lon: number,
  radiusM: number = 500,
  format: 'geojson' | 'llm_context' = 'geojson'
): Promise<unknown> {
  return apiFetch(`/permits/nearby?lat=${lat}&lon=${lon}&radius_m=${radiusM}&format=${format}`);
}

/** Server health check */
export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}
