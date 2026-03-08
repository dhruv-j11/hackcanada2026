"""
api.py — FastAPI backend for CityLens Parcel Opportunity Scorer

Endpoints:
  GET  /parcels/scores              → GeoJSON FeatureCollection with scores
  GET  /parcels/{id}/explain        → Plain-English explanation + unlock suggestions
  POST /parcels/rescore             → Re-score with custom weights
  POST /parcels/rescore-by-category → Re-score using a category profile
  GET  /parcels/categories          → List all category definitions
  GET  /parcels/clusters            → List all cluster archetypes (Feature 2)
  GET  /area/analyze                → Aggregate analysis for a bbox (Feature 3)
  POST /area/brief                  → Community development brief (Feature 1)
  POST /simulate/ion-station        → Hypothetical ION station simulator (Feature 6)
  GET  /permits/nearby              → LLM-ready permit context for a location
  POST /permits/ask                 → Ask about permits near a location
  GET  /health                      → Health check + data status

Run:
    uvicorn api:app --reload --port 8000
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

from dotenv import load_dotenv
load_dotenv()  # Load .env from project root

import geopandas as gpd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from selective_llm_pipeline import get_permit_context_for_llm, fetch_permits_near, LocationQuery
from data_ingest import fetch_all
from feature_engineering import engineer_features, ZONING_DENSITY_MAP
from scorer import (
    score_parcels, explain_parcel as _explain_parcel,
    scored_gdf_to_geojson, DEFAULT_WEIGHTS,
    CATEGORY_WEIGHT_PROFILES, get_weights_for_category,
    get_category_definitions_for_llm,
    cluster_parcels, generate_unlock_suggestions,
    simulate_new_station,
)

logger = logging.getLogger("citylens")

# ---------------------------------------------------------------------------
# In-memory data store (loaded once at startup, rescored on demand)
# ---------------------------------------------------------------------------
_state = {
    "scored_gdf": None,          # GeoDataFrame with scores + clusters
    "scored_geojson": None,      # Full GeoJSON dict (cached for fast responses)
    "current_weights": None,     # Weights used for last scoring
    "parcel_count": 0,
    "datasets": None,            # Raw datasets for re-engineering on rescore
    "ion_stations_gdf": None,    # ION stations GDF for simulation
    "census_data": None,         # Parsed census demographics by district
}

CACHE_DIR = Path(__file__).parent / "cache"

# Permitted FAR by zoning class (for capacity estimation)
PERMITTED_FAR = {
    "single_family": 0.5,
    "low_rise": 1.5,
    "mid_rise": 3.0,
    "commercial": 2.0,
    "mixed_use": 3.5,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load, score, and cluster data at startup."""
    logger.info("Loading data...")
    try:
        datasets = fetch_all()
        feature_gdf = engineer_features(datasets)
        scored = score_parcels(feature_gdf, mode="weighted_sum")

        # Feature 2: Cluster parcels into archetypes
        scored = cluster_parcels(scored, n_clusters=6)

        geojson = scored_gdf_to_geojson(scored)

        _state["scored_gdf"] = scored
        _state["scored_geojson"] = geojson
        _state["current_weights"] = dict(DEFAULT_WEIGHTS)
        _state["parcel_count"] = len(scored)
        _state["datasets"] = datasets
        _state["ion_stations_gdf"] = datasets.get("ion_stations")

        # Load census data if available
        census_path = CACHE_DIR / "waterloo_census_2021.json"
        if census_path.exists():
            with open(census_path) as f:
                _state["census_data"] = json.load(f).get("districts", {})
            logger.info(f"Loaded census data for {len(_state['census_data'])} districts.")
        else:
            _state["census_data"] = {}
            logger.info("Census data not found (run census_parser.py to generate).")

        logger.info(f"Loaded, scored, and clustered {len(scored)} parcels.")
    except Exception as e:
        logger.error(f"Failed to load data at startup: {e}")
        import traceback
        traceback.print_exc()
        logger.info("API will start but /parcels endpoints will return errors.")

    yield  # app runs here

    logger.info("Shutting down.")


app = FastAPI(
    title="CityLens API",
    version="1.0.0",
    description="AI Urban Planning Simulator for Waterloo, Ontario",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class PermitQueryRequest(BaseModel):
    """Request body for the /permits/ask endpoint."""
    question: str = Field(..., description="User's natural language question")
    latitude: float = Field(..., description="Center latitude")
    longitude: float = Field(..., description="Center longitude")
    radius_m: float = Field(500.0, description="Search radius in metres")
    token_budget: int = Field(2000, description="Max tokens for permit context")


class RescoreRequest(BaseModel):
    """Custom weights for rescoring. All values should sum to ~1.0."""
    distance_to_nearest_ion_station: float = Field(0.30, alias="distance_to_ion")
    current_vs_permitted_far_ratio: float = Field(0.25, alias="unused_far_ratio")
    lot_area_sqm: float = Field(0.20, alias="lot_area")
    current_building_age: float = Field(0.10)
    current_use_vs_zoned_use_mismatch: float = Field(0.10, alias="use_mismatch")
    walkability_proxy: float = Field(0.05)

    class Config:
        populate_by_name = True


class RescoreByCategoryRequest(BaseModel):
    """Rescore using a predefined category weight profile."""
    category: str = Field(
        ...,
        description="Development category: residential, commercial, industrial, mixed_use, institutional",
        examples=["residential", "commercial"],
    )


class AreaBriefRequest(BaseModel):
    """Request body for /area/brief."""
    bbox: Optional[List[float]] = Field(None, description="[minLon, minLat, maxLon, maxLat]")
    parcel_ids: Optional[List[str]] = Field(None, description="List of parcel IDs")


class IONStationSimRequest(BaseModel):
    """Request body for /simulate/ion-station."""
    latitude: float = Field(..., description="Hypothetical station latitude")
    longitude: float = Field(..., description="Hypothetical station longitude")


class ImpactAnalysisRequest(BaseModel):
    """Request body for /analyze/impact — Gemini-powered impact analysis."""
    parcel_id: str = Field(..., description="Parcel ID to analyze")
    proposed_change: str = Field(
        ...,
        description="Description of the proposed change, e.g. 'Replace the 40-unit apartment building with a retail store'",
        examples=[
            "Replace the apartment building with a grocery store",
            "Convert this single-family home to a 6-storey mixed-use building",
            "Build a 200-unit condo tower on this vacant lot",
        ],
    )


# ---------------------------------------------------------------------------
# Helper: check data is loaded
# ---------------------------------------------------------------------------
def _require_data():
    if _state["scored_gdf"] is None:
        raise HTTPException(
            status_code=503,
            detail="Parcel data not loaded. Check server logs for startup errors.",
        )


def _get_centroid(geom: dict) -> tuple:
    """Extract a representative (lon, lat) from a GeoJSON geometry."""
    coords = geom.get("coordinates")
    if not coords:
        return None, None
    geom_type = geom.get("type", "")
    if geom_type == "Point":
        return coords[0], coords[1]
    elif geom_type == "Polygon":
        ring = coords[0]
    elif geom_type == "MultiPolygon":
        ring = coords[0][0]
    else:
        return None, None
    return sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)


def _filter_features_by_bbox(features, min_lon, min_lat, max_lon, max_lat):
    """Filter GeoJSON features by bounding box."""
    result = []
    for feat in features:
        lon, lat = _get_centroid(feat.get("geometry", {}))
        if lon is None:
            continue
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            result.append(feat)
    return result


def _estimate_capacity(parcels_gdf):
    """
    Estimate development capacity for a set of parcels.
    Returns (total_units, population, tax_revenue, ridership).
    """
    total_units = 0
    for _, row in parcels_gdf.iterrows():
        lot_area = row.get("lot_area_sqm", 0) or 0
        zoning = str(row.get("current_zoning_density_class", "single_family"))
        far = PERMITTED_FAR.get(zoning, 1.0)
        unused_ratio = row.get("current_vs_permitted_far_ratio", 0.5) or 0.5

        avg_unit_size = 80 if zoning == "mixed_use" else 65
        units = lot_area * far * 0.8 * unused_ratio / max(avg_unit_size, 1)
        total_units += max(0, units)

    total_units = int(total_units)
    population = int(total_units * 2.0)
    tax_revenue = int(total_units * 4000)
    ridership = int(population * 0.4)
    return total_units, population, tax_revenue, ridership


# ---------------------------------------------------------------------------
# Parcel Scoring Endpoints
# ---------------------------------------------------------------------------
@app.get("/parcels/scores")
def get_parcel_scores(
    bbox: Optional[str] = Query(None, description="Bounding box: minLon,minLat,maxLon,maxLat"),
    cluster: Optional[str] = Query(None, description="Filter by cluster name"),
    heritage_adjacent: Optional[bool] = Query(None, description="Filter heritage-adjacent parcels"),
    district: Optional[str] = Query(None, description="Filter by planning district name"),
):
    """
    Returns scored parcels as a GeoJSON FeatureCollection.

    Each feature includes: parcel_id, score, tier, ward, heritage, cluster, district, and geometry.
    Use query params to filter by bbox, cluster archetype, heritage adjacency, or district.
    """
    _require_data()

    geojson = _state["scored_geojson"]
    features = geojson["features"]

    # Apply bbox filter
    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = [float(x) for x in bbox.split(",")]
        except ValueError:
            raise HTTPException(400, "bbox must be: minLon,minLat,maxLon,maxLat")
        features = _filter_features_by_bbox(features, min_lon, min_lat, max_lon, max_lat)

    # Apply cluster filter
    if cluster:
        features = [f for f in features if f["properties"].get("cluster_name") == cluster]

    # Apply heritage filter
    if heritage_adjacent is not None:
        features = [f for f in features if f["properties"].get("heritage_adjacent") == heritage_adjacent]

    # Apply district filter
    if district:
        features = [f for f in features if f["properties"].get("district_name") == district]

    metadata = {
        "total_returned": len(features),
        "total_parcels": _state["parcel_count"],
    }
    if bbox:
        metadata["bbox"] = bbox
    if cluster:
        metadata["cluster_filter"] = cluster
    if heritage_adjacent is not None:
        metadata["heritage_filter"] = heritage_adjacent

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": metadata,
    }


@app.get("/parcels/{parcel_id}/explain")
def explain_parcel_endpoint(parcel_id: str):
    """
    Returns a full feature breakdown and plain-English explanation
    of why a parcel scored the way it did.

    For Low-scoring parcels: includes constraints and unlock_suggestions.
    For Prime/High parcels: includes strengths and risks.
    Also includes ward, heritage, and cluster info.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]

    # Find parcel by ID
    mask = None
    for id_col in ["OBJECTID", "parcel_id", "PERMIT_ID"]:
        if id_col in scored_gdf.columns:
            mask = scored_gdf[id_col].astype(str) == str(parcel_id)
            if mask.any():
                break

    if mask is None or not mask.any():
        raise HTTPException(404, f"Parcel '{parcel_id}' not found.")

    idx = scored_gdf.index[mask][0]
    explanation = _explain_parcel(scored_gdf, idx)
    explanation["parcel_id"] = parcel_id

    row = scored_gdf.iloc[idx] if isinstance(idx, int) else scored_gdf.loc[idx]

    # Ward info (Feature 1)
    explanation["ward"] = f"Ward {int(row.get('ward_number', 0))} — {row.get('ward_name', 'Unknown')}"
    explanation["councillor"] = str(row.get("councillor_name", "Unknown"))

    # Heritage info (Feature 4)
    heritage_adj = bool(row.get("heritage_adjacent", 0))
    heritage_name = str(row.get("nearest_heritage_name", ""))
    heritage_dist = row.get("heritage_distance_m")
    if heritage_adj:
        dist_str = f"{heritage_dist:.0f}m" if heritage_dist and not np.isnan(heritage_dist) else "nearby"
        explanation["heritage_note"] = (
            f"This parcel is {dist_str} from {heritage_name}, a designated heritage property. "
            "Development may require a Heritage Impact Assessment."
        )
    else:
        explanation["heritage_note"] = None

    # Cluster info (Feature 2)
    explanation["cluster_name"] = str(row.get("cluster_name", "Unassigned"))

    # Planning district + census context
    district_name = str(row.get("district_name", "Unknown"))
    census_district = str(row.get("census_district_name", "Unknown"))
    explanation["district_name"] = district_name
    explanation["census_district_name"] = census_district

    # If census data is loaded, include district demographics
    census = _state.get("census_data", {})
    # Try matching by district name, then census district name
    district_data = census.get(district_name) or census.get(census_district)
    if district_data:
        explanation["district_context"] = {
            "district": district_name,
            "population": district_data.get("total_population"),
            "median_age": district_data.get("median_age"),
            "owner_pct": district_data.get("tenure", {}).get("owner", {}).get("percent"),
            "renter_pct": district_data.get("tenure", {}).get("renter", {}).get("percent"),
            "core_housing_need_pct": district_data.get("core_housing_need", {}).get("in_core_need", {}).get("percent"),
            "median_household_income": district_data.get("income", {}).get("median_after_tax_household_income"),
            "top_industries": sorted(
                district_data.get("industry_breakdown", {}).items(),
                key=lambda x: x[1].get("percent", 0), reverse=True
            )[:3],
        }
    else:
        explanation["district_context"] = None

    # Enhanced explainer (Feature 5)
    enhancements = generate_unlock_suggestions(row, scored_gdf, _state["current_weights"])
    explanation.update(enhancements)

    return explanation


@app.post("/parcels/rescore")
def rescore_parcels(req: RescoreRequest):
    """Re-score all parcels with custom feature weights."""
    _require_data()

    new_weights = {
        "distance_to_nearest_ion_station": req.distance_to_nearest_ion_station,
        "current_vs_permitted_far_ratio": req.current_vs_permitted_far_ratio,
        "lot_area_sqm": req.lot_area_sqm,
        "current_building_age": req.current_building_age,
        "current_use_vs_zoned_use_mismatch": req.current_use_vs_zoned_use_mismatch,
        "walkability_proxy": req.walkability_proxy,
    }

    datasets = fetch_all()
    feature_gdf = engineer_features(datasets)
    rescored = score_parcels(feature_gdf, mode="weighted_sum", weights=new_weights)
    rescored = cluster_parcels(rescored, n_clusters=6)
    geojson = scored_gdf_to_geojson(rescored)

    _state["scored_gdf"] = rescored
    _state["scored_geojson"] = geojson
    _state["current_weights"] = new_weights

    tier_counts = rescored["tier"].value_counts().to_dict()

    return {
        "message": "Rescored all parcels with new weights.",
        "weights_applied": new_weights,
        "parcel_count": len(rescored),
        "score_summary": {
            "mean": round(rescored["score"].mean(), 1),
            "median": round(rescored["score"].median(), 1),
            "min": round(rescored["score"].min(), 1),
            "max": round(rescored["score"].max(), 1),
        },
        "tier_breakdown": tier_counts,
    }


@app.post("/parcels/rescore-by-category")
def rescore_by_category(req: RescoreByCategoryRequest):
    """Re-score all parcels using a predefined category weight profile."""
    _require_data()

    category = req.category.lower().replace("-", "_")
    if category not in CATEGORY_WEIGHT_PROFILES:
        raise HTTPException(
            400,
            f"Unknown category '{req.category}'. "
            f"Available: {list(CATEGORY_WEIGHT_PROFILES.keys())}",
        )

    profile = CATEGORY_WEIGHT_PROFILES[category]
    new_weights = profile["weights"]

    datasets = fetch_all()
    feature_gdf = engineer_features(datasets)
    rescored = score_parcels(feature_gdf, mode="weighted_sum", weights=new_weights)
    rescored = cluster_parcels(rescored, n_clusters=6)
    geojson = scored_gdf_to_geojson(rescored)

    _state["scored_gdf"] = rescored
    _state["scored_geojson"] = geojson
    _state["current_weights"] = new_weights

    tier_counts = rescored["tier"].value_counts().to_dict()

    return {
        "message": f"Rescored all parcels for '{category}' development.",
        "category": category,
        "category_description": profile["description"],
        "weights_applied": new_weights,
        "parcel_count": len(rescored),
        "score_summary": {
            "mean": round(rescored["score"].mean(), 1),
            "median": round(rescored["score"].median(), 1),
            "min": round(rescored["score"].min(), 1),
            "max": round(rescored["score"].max(), 1),
        },
        "tier_breakdown": tier_counts,
    }


@app.get("/parcels/categories")
def list_categories():
    """Returns all category definitions for LLM classification."""
    categories = {}
    for key, profile in CATEGORY_WEIGHT_PROFILES.items():
        categories[key] = {
            "description": profile["description"],
            "keywords": profile["keywords"],
            "examples": profile["examples"],
            "weights": profile["weights"],
        }
    return {
        "categories": categories,
        "llm_classification_prompt": get_category_definitions_for_llm(),
    }


# ---------------------------------------------------------------------------
# Feature 2: Cluster Endpoints
# ---------------------------------------------------------------------------
@app.get("/parcels/clusters")
def get_clusters():
    """
    Returns all cluster archetypes with stats: parcel count, avg score,
    dominant features, and centroid characteristics.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]

    cluster_meta = scored_gdf.attrs.get("cluster_metadata", [])
    if not cluster_meta:
        raise HTTPException(500, "Cluster metadata not available. Restart the server.")

    # Add description text for each cluster
    archetype_descriptions = {
        "Transit-Adjacent Sleepers": (
            "Parcels close to ION LRT stations with significant unused development "
            "capacity. These represent the lowest-hanging fruit for transit-oriented densification."
        ),
        "Suburban Holdouts": (
            "Large lots far from transit, typical of low-density suburban areas. "
            "High potential for intensification if transit extends."
        ),
        "Urban Core Saturated": (
            "Walkable, already built-out parcels in the urban core. Limited room "
            "for additional development without demolition or height variance."
        ),
        "Aging Opportunity": (
            "Older buildings on underused parcels. Strong candidates for "
            "redevelopment due to both structural age and unused density."
        ),
        "Zoning Mismatch": (
            "Parcels where current use is below zoned potential. For example, "
            "single-family homes in zones that permit mid-rise mixed-use."
        ),
        "General Mixed": (
            "Parcels with balanced characteristics that don't fit a single archetype. "
            "May still represent moderate development opportunities."
        ),
    }

    for cm in cluster_meta:
        cm["description"] = archetype_descriptions.get(cm["cluster_name"], "")

    return {"clusters": cluster_meta}


# ---------------------------------------------------------------------------
# Feature 3: "Build This Block" Aggregate Endpoint
# ---------------------------------------------------------------------------
@app.get("/area/analyze")
def analyze_area(
    bbox: str = Query(..., description="Bounding box: minLon,minLat,maxLon,maxLat"),
):
    """
    Aggregate development analysis of all parcels within a bounding box.
    Includes tier/cluster breakdowns, capacity estimates, ward info, and top parcels.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]

    try:
        min_lon, min_lat, max_lon, max_lat = [float(x) for x in bbox.split(",")]
    except ValueError:
        raise HTTPException(400, "bbox must be: minLon,minLat,maxLon,maxLat")

    # Filter parcels by bbox using the GeoDataFrame directly
    gdf = scored_gdf.copy()
    centroids = gdf.geometry.representative_point()
    mask = (
        (centroids.x >= min_lon) & (centroids.x <= max_lon) &
        (centroids.y >= min_lat) & (centroids.y <= max_lat)
    )
    area_gdf = gdf[mask]

    if len(area_gdf) == 0:
        raise HTTPException(404, "No parcels found in the specified bounding box.")

    # Score stats
    tier_counts = area_gdf["tier"].value_counts().to_dict()
    cluster_counts = area_gdf["cluster_name"].value_counts().to_dict() if "cluster_name" in area_gdf.columns else {}

    # Capacity estimation
    total_units, population, tax_revenue, ridership = _estimate_capacity(area_gdf)

    # Heritage constraints
    heritage_count = int(area_gdf.get("heritage_adjacent", 0).sum()) if "heritage_adjacent" in area_gdf.columns else 0
    constraints = {}
    if heritage_count > 0:
        constraints["heritage_adjacent"] = heritage_count

    # Ward breakdown
    wards_affected = []
    if "ward_name" in area_gdf.columns:
        ward_counts = area_gdf.groupby(["ward_number", "ward_name", "councillor_name"]).size().reset_index(name="parcels")
        for _, wrow in ward_counts.iterrows():
            wards_affected.append({
                "ward": f"Ward {int(wrow['ward_number'])} — {wrow['ward_name']}",
                "councillor": wrow["councillor_name"],
                "parcels": int(wrow["parcels"]),
            })

    # Top 10 parcels by score
    top_10 = area_gdf.nlargest(10, "score")
    top_10_list = []
    for _, row in top_10.iterrows():
        parcel_id = str(row.get("OBJECTID", row.get("parcel_id", row.name)))
        top_10_list.append({
            "parcel_id": parcel_id,
            "address": str(row.get("ADDRESS", "")),
            "score": float(row["score"]),
        })

    return {
        "bbox": [min_lon, min_lat, max_lon, max_lat],
        "total_parcels": len(area_gdf),
        "tier_breakdown": tier_counts,
        "cluster_breakdown": cluster_counts,
        "avg_score": round(float(area_gdf["score"].mean()), 1),
        "median_score": round(float(area_gdf["score"].median()), 1),
        "total_lot_area_sqm": round(float(area_gdf["lot_area_sqm"].sum()), 0),
        "estimated_additional_units": total_units,
        "estimated_population_increase": population,
        "estimated_annual_tax_revenue": tax_revenue,
        "estimated_ion_ridership_daily": ridership,
        "constraints_summary": constraints,
        "wards_affected": wards_affected,
        "top_10_parcels": top_10_list,
    }


# ---------------------------------------------------------------------------
# Feature 1: Community Brief
# ---------------------------------------------------------------------------
@app.post("/area/brief")
def area_brief(req: AreaBriefRequest):
    """
    Generate a structured community development brief for a selected area.
    Accepts either a bbox or a list of parcel_ids.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]

    if req.bbox:
        min_lon, min_lat, max_lon, max_lat = req.bbox
        centroids = scored_gdf.geometry.representative_point()
        mask = (
            (centroids.x >= min_lon) & (centroids.x <= max_lon) &
            (centroids.y >= min_lat) & (centroids.y <= max_lat)
        )
        area_gdf = scored_gdf[mask]
    elif req.parcel_ids:
        masks = []
        for id_col in ["OBJECTID", "parcel_id", "PERMIT_ID"]:
            if id_col in scored_gdf.columns:
                masks.append(scored_gdf[id_col].astype(str).isin(req.parcel_ids))
        if masks:
            combined_mask = masks[0]
            for m in masks[1:]:
                combined_mask = combined_mask | m
            area_gdf = scored_gdf[combined_mask]
        else:
            area_gdf = scored_gdf.iloc[0:0]  # empty
    else:
        raise HTTPException(400, "Either 'bbox' or 'parcel_ids' is required.")

    if len(area_gdf) == 0:
        raise HTTPException(404, "No parcels found in the specified area.")

    # Ward determination (most common ward in area)
    ward_name = "Unknown"
    councillor = "Unknown"
    if "ward_name" in area_gdf.columns:
        ward_mode = area_gdf["ward_name"].mode()
        if len(ward_mode) > 0:
            ward_name = ward_mode.iloc[0]
            ward_row = area_gdf[area_gdf["ward_name"] == ward_name].iloc[0]
            ward_num = int(ward_row.get("ward_number", 0))
            councillor = str(ward_row.get("councillor_name", "Unknown"))
            ward_name = f"Ward {ward_num} — {ward_name}"

    # Tier counts
    tier_counts = area_gdf["tier"].value_counts().to_dict()

    # Capacity estimation
    total_units, population, tax_revenue, ridership = _estimate_capacity(area_gdf)

    # Constraints
    constraints = []
    heritage_count = int(area_gdf.get("heritage_adjacent", 0).sum()) if "heritage_adjacent" in area_gdf.columns else 0
    if heritage_count > 0:
        constraints.append(f"{heritage_count} parcels adjacent to heritage buildings")

    # Generate brief text
    brief_text = (
        f"{ward_name} Development Opportunity: {len(area_gdf)} parcels identified "
        f"with combined development capacity of approximately {total_units:,} units. "
        f"This could support an estimated population increase of {population:,} and "
        f"generate approximately ${tax_revenue:,} in annual tax revenue. "
        f"ION ridership is projected to increase by {ridership:,} daily trips."
    )

    return {
        "area_name": f"Selected area ({len(area_gdf)} parcels)",
        "ward": ward_name,
        "councillor": councillor,
        "total_parcels": len(area_gdf),
        "prime_parcels": tier_counts.get("Prime Opportunity", 0),
        "high_parcels": tier_counts.get("High Opportunity", 0),
        "moderate_parcels": tier_counts.get("Moderate Opportunity", 0),
        "low_parcels": tier_counts.get("Low Opportunity", 0),
        "estimated_total_capacity_units": total_units,
        "estimated_population_increase": population,
        "estimated_annual_tax_revenue": tax_revenue,
        "estimated_ion_ridership_increase": ridership,
        "constraints": constraints,
        "brief_text": brief_text,
    }


# ---------------------------------------------------------------------------
# Feature 6: Hypothetical ION Station Simulator
# ---------------------------------------------------------------------------
@app.post("/simulate/ion-station")
def simulate_ion_station(req: IONStationSimRequest):
    """
    Place a hypothetical new ION station and see how all parcel scores change.
    Returns before/after comparison and the top 20 most-improved parcels.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]
    ion_gdf = _state["ion_stations_gdf"]

    if ion_gdf is None:
        raise HTTPException(500, "ION stations data not available.")

    old_scores = scored_gdf["score"].copy()

    # Simulate
    rescored = simulate_new_station(
        scored_gdf, req.latitude, req.longitude,
        ion_gdf, weights=_state["current_weights"]
    )

    # Compute stats
    new_scores = rescored["score"]
    deltas = rescored["score_delta"]

    score_increased = int((deltas > 0).sum())

    # Tier change tracking
    old_tiers = scored_gdf["tier"]
    new_tiers = rescored["tier"]
    tier_changes = {
        "low_to_moderate": int(((old_tiers == "Low Opportunity") & (new_tiers == "Moderate Opportunity")).sum()),
        "moderate_to_high": int(((old_tiers == "Moderate Opportunity") & (new_tiers == "High Opportunity")).sum()),
        "high_to_prime": int(((old_tiers == "High Opportunity") & (new_tiers == "Prime Opportunity")).sum()),
    }

    # Top 20 most improved
    top_20_idx = deltas.nlargest(20).index
    top_20_list = []
    for idx in top_20_idx:
        row = rescored.loc[idx]
        parcel_id = str(row.get("OBJECTID", row.get("parcel_id", idx)))
        top_20_list.append({
            "parcel_id": parcel_id,
            "address": str(row.get("ADDRESS", "")),
            "old_score": float(row.get("old_score", 0)),
            "new_score": float(row["score"]),
            "delta": float(row["score_delta"]),
        })

    # Build the full geojson with deltas
    geojson = scored_gdf_to_geojson(rescored)

    return {
        "station_location": {"lat": req.latitude, "lon": req.longitude},
        "parcels_affected": len(rescored),
        "parcels_score_increased": score_increased,
        "avg_score_before": round(float(old_scores.mean()), 1),
        "avg_score_after": round(float(new_scores.mean()), 1),
        "tier_changes": tier_changes,
        "top_20_most_improved": top_20_list,
        "geojson": geojson,
    }


# ---------------------------------------------------------------------------
# Gemini-Powered Impact Analysis (Census-Grounded)
# ---------------------------------------------------------------------------
@app.post("/analyze/impact")
def analyze_impact(req: ImpactAnalysisRequest):
    """
    Analyze the demographic and community impact of a proposed land-use change
    for a specific parcel. Uses real census data from the parcel's planning
    district to ground Gemini's estimates.

    Example: "Replace the 40-unit apartment with a retail store"
    → Gemini estimates population displacement, housing supply loss,
      employment creation, tax revenue change, neighbourhood character impact,
      all grounded in real district-level demographics.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]
    census = _state.get("census_data", {})

    # 1. Find the parcel
    mask = None
    for id_col in ["OBJECTID", "parcel_id", "PERMIT_ID"]:
        if id_col in scored_gdf.columns:
            mask = scored_gdf[id_col].astype(str) == str(req.parcel_id)
            if mask.any():
                break

    if mask is None or not mask.any():
        raise HTTPException(404, f"Parcel '{req.parcel_id}' not found.")

    idx = scored_gdf.index[mask][0]
    row = scored_gdf.loc[idx]

    # 2. Get parcel details
    parcel_info = {
        "parcel_id": req.parcel_id,
        "address": str(row.get("ADDRESS", "Unknown")),
        "score": float(row.get("score", 0)),
        "tier": str(row.get("tier", "Unknown")),
        "lot_area_sqm": float(row.get("lot_area_sqm", 0)),
        "zoning_class": str(row.get("current_zoning_density_class", "")),
        "building_age": float(row.get("current_building_age", 0)),
        "ward": f"Ward {int(row.get('ward_number', 0))} — {row.get('ward_name', 'Unknown')}",
        "councillor": str(row.get("councillor_name", "Unknown")),
        "heritage_adjacent": bool(row.get("heritage_adjacent", 0)),
        "nearest_heritage_name": str(row.get("nearest_heritage_name", "")),
        "heritage_distance_m": float(row.get("heritage_distance_m", 0))
            if not np.isnan(row.get("heritage_distance_m", 0)) else None,
        "district_name": str(row.get("district_name", "Unknown")),
        "census_district_name": str(row.get("census_district_name", "Unknown")),
        "cluster_name": str(row.get("cluster_name", "Unknown")),
        "distance_to_ion_m": float(row.get("distance_to_nearest_ion_station", 0)),
        "walkability_proxy": float(row.get("walkability_proxy", 0)),
    }

    # 3. Look up census data for this parcel's district ONLY
    district_name = parcel_info["district_name"]
    census_district = parcel_info["census_district_name"]
    district_data = census.get(district_name) or census.get(census_district)

    if not district_data:
        # Try partial match
        for key, val in census.items():
            if key.lower() in district_name.lower() or district_name.lower() in key.lower():
                district_data = val
                break

    if not district_data:
        raise HTTPException(
            404,
            f"No census data found for district '{district_name}' "
            f"(census key: '{census_district}'). Census data available for: {list(census.keys())}"
        )

    # 4. Build context-rich prompt for Gemini
    # Extract key census sections
    top_industries = sorted(
        district_data.get("industry_breakdown", {}).items(),
        key=lambda x: x[1].get("percent", 0), reverse=True
    )[:5]
    top_industry_str = ", ".join(
        [f"{k.replace('_', ' ').title()}: {v['count']} ({v['percent']}%)" for k, v in top_industries]
    )

    dwelling_types = district_data.get("dwellings_by_type", {})
    dwelling_str = ", ".join(
        [f"{k.replace('_', ' ').title()}: {v['count']} ({v['percent']}%)" for k, v in dwelling_types.items() if v.get("count", 0) > 0]
    )

    tenure = district_data.get("tenure", {})
    income = district_data.get("income", {})
    core_need = district_data.get("core_housing_need", {})
    labour = district_data.get("labour_force", {})
    immigration = district_data.get("immigration", {})
    mobility = district_data.get("mobility_5yr", {})
    households_by_size = district_data.get("households_by_size", {})

    # Heritage warning
    heritage_context = ""
    if parcel_info["heritage_adjacent"]:
        heritage_context = (
            f"\n⚠️ HERITAGE CONSTRAINT: This parcel is {parcel_info['heritage_distance_m']}m from "
            f"'{parcel_info['nearest_heritage_name']}', a designated heritage building. "
            "Any development will require a Heritage Impact Assessment, "
            "adding 6-12 months to planning timelines and potentially limiting "
            "building height and massing.\n"
        )

    prompt = f"""You are CityLens, an AI urban planning analyst for Waterloo, Ontario. 
You specialize in estimating the real-world impact of land-use changes using actual census data.

PROPOSED CHANGE: {req.proposed_change}

PARCEL DETAILS:
- Address: {parcel_info['address']}
- Lot Area: {parcel_info['lot_area_sqm']:.0f} sqm
- Current Zoning: {parcel_info['zoning_class']}
- Building Age: {parcel_info['building_age']:.0f} years
- Development Score: {parcel_info['score']:.1f}/100 ({parcel_info['tier']})
- Cluster Archetype: {parcel_info['cluster_name']}
- Distance to ION LRT: {parcel_info['distance_to_ion_m']:.0f}m
- Walkability (nearby amenities): {parcel_info['walkability_proxy']:.0f}
- Ward: {parcel_info['ward']}
- Councillor: {parcel_info['councillor']}
{heritage_context}
PLANNING DISTRICT: {district_name}
(This is the ONLY district affected — all demographic data below is specific to this district)

DISTRICT DEMOGRAPHICS (2021 Census):
- Total Population: {district_data.get('total_population', 'N/A')}
- Median Age: {district_data.get('median_age', 'N/A')}
- Total Households: {district_data.get('total_private_households', 'N/A')}
- Avg Persons Per Household: {district_data.get('avg_persons_per_household', 'N/A')}
- Household Sizes: {json.dumps({k: v for k, v in households_by_size.items()}, default=str)}
- Total Dwellings: {district_data.get('total_dwellings', 'N/A')}
- Dwelling Types: {dwelling_str}
- Tenure: Owner {tenure.get('owner', {}).get('count', 'N/A')} ({tenure.get('owner', {}).get('percent', 'N/A')}%), Renter {tenure.get('renter', {}).get('count', 'N/A')} ({tenure.get('renter', {}).get('percent', 'N/A')}%)
- Core Housing Need: {core_need.get('in_core_need', {}).get('count', 'N/A')} households ({core_need.get('in_core_need', {}).get('percent', 'N/A')}%)
- Median After-Tax Household Income: ${income.get('median_after_tax_household_income', 'N/A')}
- Employment Rate: {labour.get('employment_rate', 'N/A')}%
- Unemployment Rate: {labour.get('unemployment_rate', 'N/A')}%
- Top Industries: {top_industry_str}
- Immigrants: {immigration.get('immigrants', {}).get('count', 'N/A')} ({immigration.get('immigrants', {}).get('percent', 'N/A')}%)
- 5yr Mobility (movers): {mobility.get('movers', {}).get('count', 'N/A')} ({mobility.get('movers', {}).get('percent', 'N/A')}%)

INSTRUCTIONS:
Based on the proposed change and the REAL demographics above, provide a structured analysis with:

1. **Population Impact**: Estimate how many residents would be displaced or added. Use the district's avg persons per household and dwelling type mix to ground your estimates.

2. **Housing Supply Impact**: How does this change affect the district's housing stock? Reference the current dwelling type breakdown and core housing need rate.

3. **Employment Impact**: Estimate jobs created or lost. Reference the district's current industry breakdown and employment rate.

4. **Tax Revenue Impact**: Estimate the change in annual property tax revenue using Waterloo's typical commercial vs residential rates.

5. **Community Character**: How does this change affect the neighbourhood? Consider the district's current tenure split (owner/renter), median age, income, and mobility.

6. **Displacement Risk**: Assess based on the district's core housing need rate, renter percentage, and median income relative to Waterloo's median ($82,000).

7. **Transit Impact**: Consider the parcel's distance to ION LRT ({parcel_info['distance_to_ion_m']:.0f}m) and how the change affects transit ridership.

8. **Recommendation**: Provide a balanced assessment — is this change net positive or negative for the district? What conditions or mitigations would improve the outcome?

Be specific — cite actual numbers from the census data. Give concrete estimates, not vague generalizations."""

    # 5. Call Gemini
    gemini_api_key = os.environ.get("GEMINI_API_KEY")

    if gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            analysis = response.text
        except Exception as e:
            analysis = f"[Gemini API error: {str(e)}] Set GEMINI_API_KEY environment variable."
    else:
        analysis = (
            "[GEMINI_API_KEY not set] To enable AI-powered impact analysis, "
            "set the GEMINI_API_KEY environment variable and restart the server. "
            "The census context has been prepared and is returned in the 'census_context' field below."
        )

    return {
        "parcel": parcel_info,
        "proposed_change": req.proposed_change,
        "district": district_name,
        "analysis": analysis,
        "census_context": {
            "district": district_name,
            "population": district_data.get("total_population"),
            "median_age": district_data.get("median_age"),
            "total_households": district_data.get("total_private_households"),
            "avg_persons_per_household": district_data.get("avg_persons_per_household"),
            "total_dwellings": district_data.get("total_dwellings"),
            "tenure": tenure,
            "core_housing_need_pct": core_need.get("in_core_need", {}).get("percent"),
            "median_household_income": income.get("median_after_tax_household_income"),
            "unemployment_rate": labour.get("unemployment_rate"),
            "top_industries": [{k.replace("_", " ").title(): v} for k, v in top_industries],
            "dwelling_types": dwelling_types,
        },
    }


# ---------------------------------------------------------------------------
# Permit Endpoints (LLM-selective-passing)
# ---------------------------------------------------------------------------
@app.get("/permits/nearby")
def get_nearby_permits(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    radius_m: float = Query(500.0, description="Search radius in metres"),
    status: Optional[str] = Query(None, description="Filter by permit status"),
    min_value: Optional[float] = Query(None, description="Min construction value"),
    max_results: int = Query(50, description="Max permits to return"),
    format: str = Query("geojson", description="'geojson' or 'llm_context'"),
):
    """Fetch building permits near a location."""
    if format == "llm_context":
        context = get_permit_context_for_llm(
            lat=lat, lon=lon, radius_m=radius_m,
            permit_status=status, min_value=min_value,
            max_results=max_results, token_budget=2000,
        )
        return {"context": context, "approx_tokens": len(context) // 4}

    query = LocationQuery(
        latitude=lat, longitude=lon, radius_m=radius_m,
        permit_status=status, min_value=min_value, max_results=max_results,
    )
    geojson = fetch_permits_near(query)
    return geojson


@app.post("/permits/ask")
def ask_about_permits(req: PermitQueryRequest):
    """Natural-language Q&A about permits near a location."""
    permit_context = get_permit_context_for_llm(
        lat=req.latitude,
        lon=req.longitude,
        radius_m=req.radius_m,
        token_budget=req.token_budget,
    )

    # Use Gemini if key is available
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(
                f"You are CityLens, an AI urban planning assistant for Waterloo, Ontario. "
                f"Use the provided building permit data to answer questions about "
                f"development activity in specific areas. Be specific — cite permit numbers, "
                f"addresses, and values.\n\n"
                f"Building permits near ({req.latitude}, {req.longitude}):\n"
                f"{permit_context}\n\n"
                f"Question: {req.question}"
            )
            answer = response.text
        except Exception as e:
            answer = (
                f"[Gemini API error: {str(e)}] "
                f"Found {permit_context.count('#')} permits within {req.radius_m}m."
            )
    else:
        answer = (
            f"[GEMINI_API_KEY not set] Found {permit_context.count('#')} permits "
            f"within {req.radius_m}m. Set GEMINI_API_KEY in .env to get AI-powered answers."
        )

    return {
        "answer": answer,
        "permits_used": permit_context.count("#"),
        "context_tokens": len(permit_context) // 4,
        "raw_context": permit_context,
    }


# ---------------------------------------------------------------------------
# Planning District & Census Endpoints
# ---------------------------------------------------------------------------
@app.get("/districts")
def list_districts():
    """
    Lists all planning districts with parcel counts and census data availability.
    Use the district name with GET /district/{name}/demographics for full census data.
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]
    census = _state.get("census_data", {})

    districts = []
    if "district_name" in scored_gdf.columns:
        district_groups = scored_gdf.groupby("district_name")
        for name, group in district_groups:
            if name == "Unknown":
                continue
            census_name = group["census_district_name"].mode().iloc[0] if "census_district_name" in group.columns else name
            has_census = census_name in census or name in census
            districts.append({
                "district_name": name,
                "census_district_name": census_name,
                "parcel_count": len(group),
                "avg_score": round(float(group["score"].mean()), 1),
                "has_census_data": has_census,
            })

    # Sort by parcel count descending
    districts.sort(key=lambda x: x["parcel_count"], reverse=True)

    return {
        "total_districts": len(districts),
        "census_data_loaded": len(census) > 0,
        "census_districts_available": len(census),
        "districts": districts,
    }


@app.get("/district/{district_name}/demographics")
def get_district_demographics(district_name: str):
    """
    Returns full census demographics for a planning district.
    Census data must be loaded from cache/waterloo_census_2021.json
    (generated by census_parser.py).
    """
    census = _state.get("census_data", {})
    if not census:
        raise HTTPException(
            503,
            "Census data not loaded. Run census_parser.py to generate "
            "cache/waterloo_census_2021.json, then restart the server."
        )

    # Try exact match first, then case-insensitive
    district = census.get(district_name)
    if not district:
        # Try case-insensitive match
        for key, val in census.items():
            if key.lower() == district_name.lower():
                district = val
                break

    if not district:
        available = list(census.keys())
        raise HTTPException(
            404,
            f"District '{district_name}' not found in census data. "
            f"Available: {available}"
        )

    return district


# ---------------------------------------------------------------------------
# Health / Status
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    """Health check with full capability status."""
    scored_gdf = _state["scored_gdf"]
    response = {
        "status": "ok",
        "data_loaded": scored_gdf is not None,
        "parcel_count": _state["parcel_count"],
        "current_weights": _state["current_weights"],
    }

    if scored_gdf is not None:
        # Cluster info
        cluster_meta = scored_gdf.attrs.get("cluster_metadata", [])
        response["cluster_count"] = len(cluster_meta)

        # Ward coverage
        if "ward_number" in scored_gdf.columns:
            response["ward_coverage"] = int((scored_gdf["ward_number"] > 0).sum())

        # Heritage flags
        if "heritage_adjacent" in scored_gdf.columns:
            response["heritage_adjacent_count"] = int(scored_gdf["heritage_adjacent"].sum())

        # District coverage
        if "district_name" in scored_gdf.columns:
            response["district_coverage"] = int((scored_gdf["district_name"] != "Unknown").sum())
            response["unique_districts"] = int(scored_gdf["district_name"].nunique())

    # Census data status
    census = _state.get("census_data", {})
    response["census_loaded"] = len(census) > 0
    response["census_districts"] = len(census)

    return response


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
