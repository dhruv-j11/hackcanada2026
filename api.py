"""
api.py — FastAPI backend for CityLens Parcel Opportunity Scorer

Endpoints:
  GET  /parcels/scores          → GeoJSON FeatureCollection with scores (bbox filtering)
  GET  /parcels/{id}/explain    → Plain-English explanation of a parcel's score
  POST /parcels/rescore         → Re-score with custom weights
  GET  /permits/nearby          → LLM-ready permit context for a location
  POST /permits/ask             → Ask a natural-language question about permits near a location
  GET  /health                  → Health check + data status

Run:
    uvicorn api:app --reload --port 8000
"""

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import geopandas as gpd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from selective_llm_pipeline import get_permit_context_for_llm, fetch_permits_near, LocationQuery
from data_ingest import fetch_all
from feature_engineering import engineer_features
from scorer import (
    score_parcels, explain_parcel as _explain_parcel,
    scored_gdf_to_geojson, DEFAULT_WEIGHTS,
    CATEGORY_WEIGHT_PROFILES, get_weights_for_category,
    get_category_definitions_for_llm,
)

logger = logging.getLogger("citylens")

# ---------------------------------------------------------------------------
# In-memory data store (loaded once at startup, rescored on demand)
# ---------------------------------------------------------------------------
_state = {
    "scored_gdf": None,          # GeoDataFrame with scores
    "scored_geojson": None,      # Full GeoJSON dict (cached for fast responses)
    "current_weights": None,     # Weights used for last scoring
    "parcel_count": 0,
}

CACHE_DIR = Path(__file__).parent / "cache"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load and score data at startup."""
    logger.info("Loading data...")
    try:
        datasets = fetch_all()
        feature_gdf = engineer_features(datasets)
        scored = score_parcels(feature_gdf, mode="weighted_sum")
        geojson = scored_gdf_to_geojson(scored)

        _state["scored_gdf"] = scored
        _state["scored_geojson"] = geojson
        _state["current_weights"] = dict(DEFAULT_WEIGHTS)
        _state["parcel_count"] = len(scored)

        logger.info(f"Loaded and scored {len(scored)} parcels.")
    except Exception as e:
        logger.error(f"Failed to load data at startup: {e}")
        logger.info("API will start but /parcels endpoints will return errors.")

    yield  # app runs here

    logger.info("Shutting down.")


app = FastAPI(
    title="CityLens API",
    version="0.3.0",
    description="Parcel Opportunity Scorer for Waterloo, Ontario",
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


# ---------------------------------------------------------------------------
# Helper: check data is loaded
# ---------------------------------------------------------------------------
def _require_data():
    if _state["scored_gdf"] is None:
        raise HTTPException(
            status_code=503,
            detail="Parcel data not loaded. Check server logs for startup errors.",
        )


# ---------------------------------------------------------------------------
# Parcel Scoring Endpoints
# ---------------------------------------------------------------------------
@app.get("/parcels/scores")
def get_parcel_scores(
    bbox: Optional[str] = Query(
        None,
        description="Bounding box filter: minLon,minLat,maxLon,maxLat",
        example="-80.55,43.45,-80.50,43.48",
    ),
):
    """
    Returns scored parcels as a GeoJSON FeatureCollection.

    Each feature includes:
      - parcel_id, score (0-100), tier, tier_color
      - top_3_contributing_features
      - geometry

    Use the `bbox` query param for viewport-based loading
    (only returns parcels whose centroid falls within the bounding box).
    """
    _require_data()

    geojson = _state["scored_geojson"]

    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = [float(x) for x in bbox.split(",")]
        except ValueError:
            raise HTTPException(400, "bbox must be: minLon,minLat,maxLon,maxLat")

        # Filter features by bbox
        filtered_features = []
        for feat in geojson["features"]:
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates")
            if not coords:
                continue

            # Get representative point based on geometry type
            geom_type = geom.get("type", "")
            if geom_type == "Point":
                lon, lat = coords[0], coords[1]
            elif geom_type in ("Polygon", "MultiPolygon"):
                # Use first coordinate as rough centroid
                if geom_type == "Polygon":
                    ring = coords[0]
                else:
                    ring = coords[0][0]
                lon = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            else:
                continue

            if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
                filtered_features.append(feat)

        return {
            "type": "FeatureCollection",
            "features": filtered_features,
            "metadata": {
                "total_in_bbox": len(filtered_features),
                "total_parcels": _state["parcel_count"],
                "bbox": bbox,
            },
        }

    # No bbox — return everything (consider paginating for large datasets)
    return geojson


@app.get("/parcels/{parcel_id}/explain")
def explain_parcel_endpoint(parcel_id: str):
    """
    Returns a full feature breakdown and plain-English explanation
    of why a parcel scored the way it did.

    Example response:
    {
      "score": 84,
      "tier": "Prime Opportunity",
      "explanation": "178 MARSHALL ST scores 84/100 (Prime Opportunity).
        This is primarily because it is approximately 180m from the nearest
        ION station; only 23% of permitted floor area ratio is currently used;
        the existing structure dates to approximately 1962.",
      "features": { ... },
      "top_3_contributing_features": [ ... ]
    }
    """
    _require_data()
    scored_gdf = _state["scored_gdf"]

    # Find parcel by ID — check multiple potential ID columns
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

    return explanation


@app.post("/parcels/rescore")
def rescore_parcels(req: RescoreRequest):
    """
    Re-score all parcels with custom feature weights.

    Lets planners adjust what matters most to them in real time.
    The response includes the new scoring summary and tier breakdown.
    """
    _require_data()

    # Build weights dict matching scorer.py's DEFAULT_WEIGHTS keys
    new_weights = {
        "distance_to_nearest_ion_station": req.distance_to_nearest_ion_station,
        "current_vs_permitted_far_ratio": req.current_vs_permitted_far_ratio,
        "lot_area_sqm": req.lot_area_sqm,
        "current_building_age": req.current_building_age,
        "current_use_vs_zoned_use_mismatch": req.current_use_vs_zoned_use_mismatch,
        "walkability_proxy": req.walkability_proxy,
    }

    # Re-fetch the feature GDF (before scoring was applied)
    # We re-score from the scored_gdf but the scorer handles this
    datasets = fetch_all()  # uses cache, very fast
    feature_gdf = engineer_features(datasets)
    rescored = score_parcels(feature_gdf, mode="weighted_sum", weights=new_weights)
    geojson = scored_gdf_to_geojson(rescored)

    # Update state
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
    """
    Re-score all parcels using a predefined category weight profile.

    Available categories: residential, commercial, industrial, mixed_use, institutional.
    Each category emphasizes different factors (e.g. residential prioritizes
    walkability and transit; industrial prioritizes lot size).

    The LLM classifies the user's prompt into a category, then calls this
    endpoint to rescore with the appropriate weights.
    """
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

    datasets = fetch_all()  # uses cache
    feature_gdf = engineer_features(datasets)
    rescored = score_parcels(feature_gdf, mode="weighted_sum", weights=new_weights)
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
    """
    Returns all available development categories with their weight profiles,
    descriptions, keywords, and example prompts.

    Use this to:
    - Populate a category selector in the UI
    - Inject into an LLM prompt for automatic classification
    """
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
    """
    Fetch building permits near a location.

    format=geojson     → raw GeoJSON for map rendering
    format=llm_context → compact text string ready to inject into LLM prompt
    """
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
    """
    Natural-language Q&A about permits near a location.
    Spatially filters → ranks → compacts → sends to LLM.
    """
    permit_context = get_permit_context_for_llm(
        lat=req.latitude,
        lon=req.longitude,
        radius_m=req.radius_m,
        token_budget=req.token_budget,
    )

    # TODO: Wire up your Gemini API key here:
    #
    # import google.generativeai as genai
    # genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    # model = genai.GenerativeModel("gemini-2.0-flash")
    # response = model.generate_content(
    #     f"You are CityLens, an AI urban planning assistant for Waterloo, Ontario. "
    #     f"Answer questions about development activity using the provided building "
    #     f"permit data. Be specific — cite permit numbers, addresses, and values.\n\n"
    #     f"Building permits near ({req.latitude}, {req.longitude}):\n"
    #     f"{permit_context}\n\n"
    #     f"Question: {req.question}"
    # )
    # answer = response.text

    answer = (
        f"[LLM placeholder] Found {permit_context.count('#')} permits "
        f"within {req.radius_m}m. Wire up your GEMINI_API_KEY to get real answers."
    )

    return {
        "answer": answer,
        "permits_used": permit_context.count("#"),
        "context_tokens": len(permit_context) // 4,
        "raw_context": permit_context,
    }


# ---------------------------------------------------------------------------
# Health / Status
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    """Health check with data loading status."""
    return {
        "status": "ok",
        "data_loaded": _state["scored_gdf"] is not None,
        "parcel_count": _state["parcel_count"],
        "current_weights": _state["current_weights"],
    }


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
