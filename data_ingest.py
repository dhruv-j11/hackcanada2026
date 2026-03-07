"""
data_ingest.py — Fetch and cache all spatial data from Region of Waterloo GeoHub.

Data sources (all open, no auth):
  1. Parcels (property boundaries + attributes)
  2. ION LRT station locations
  3. Zoning boundaries
  4. Building permits (already handled in selective_llm_pipeline.py)

Each dataset is fetched from its ArcGIS REST endpoint, cached locally as
GeoJSON, and loaded into a GeoDataFrame for downstream use.

Usage:
    python data_ingest.py              # fetch all, print summaries
    python data_ingest.py --refresh    # force re-fetch even if cache exists
"""

import os
import sys
import json
import time
import requests
import geopandas as gpd
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# ArcGIS REST Endpoints
# ---------------------------------------------------------------------------
# These are the public endpoints from the Region of Waterloo GeoHub and
# City of Waterloo Open Data. Update these if the service URLs change.

_BASE = "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services"

ENDPOINTS = {
    # ── Core datasets (required) ──────────────────────────────────────────
    "parcels": {
        # Property_Fabric is an ArcGIS Parcel Fabric — layer 0 may not be
        # directly queryable. We try multiple layer IDs in fetch_and_cache.
        # If all fail, we synthesize parcels from building_permits.
        "url": f"{_BASE}/Property_Fabric/FeatureServer",
        "cache": "parcel_cache.geojson",
        "description": "Property parcel boundaries (Property_Fabric)",
        "try_layer_ids": [1, 2, 3, 4, 5, 0],  # parcel polygons often on layer 1-5
    },
    "building_permits": {
        "url": f"{_BASE}/City_of_Waterloo_Building_Permits/FeatureServer/0/query",
        "cache": "building_permits_cache.geojson",
        "description": "Building permits (point locations with permit details)",
    },
    "buildings": {
        "url": f"{_BASE}/Buildings/FeatureServer/0/query",
        "cache": "buildings_cache.geojson",
        "description": "Building footprints with area attributes",
    },

    # ── Zoning / planning ─────────────────────────────────────────────────
    "district_plans": {
        "url": f"{_BASE}/DistrictPlans/FeatureServer/0/query",
        "cache": "district_plans_cache.geojson",
        "description": "District plan boundaries (proxy for zoning density)",
    },
    "major_dev": {
        "url": f"{_BASE}/MajorDevelopmentFiles/FeatureServer/0/query",
        "cache": "major_dev_cache.geojson",
        "description": "Major development application files",
    },

    # ── Transit (ION) ─────────────────────────────────────────────────────
    # The City of Waterloo GeoHub does NOT host an ION stations layer.
    # ION station data lives on the Region of Waterloo GeoHub under a
    # different ArcGIS org. We hard-code the 19 station coordinates as a
    # fallback (see ION_STATIONS_FALLBACK below).
    "ion_stations": {
        "url": None,  # no endpoint on this org — uses fallback
        "cache": "ion_stations_cache.geojson",
        "description": "ION LRT station locations (hardcoded fallback)",
    },

    # ── Amenity / spatial context ─────────────────────────────────────────
    "parks": {
        "url": f"{_BASE}/Parks/FeatureServer/0/query",
        "cache": "parks_cache.geojson",
        "description": "Park polygon boundaries",
    },
    "roads": {
        "url": f"{_BASE}/Roads/FeatureServer/0/query",
        "cache": "roads_cache.geojson",
        "description": "Road centreline network",
    },
    "heritage_buildings": {
        "url": f"{_BASE}/HeritageBuildings/FeatureServer/0/query",
        "cache": "heritage_buildings_cache.geojson",
        "description": "Designated heritage buildings (older stock indicator)",
    },
    "points_of_interest": {
        "url": f"{_BASE}/PointsOfInterest/FeatureServer/0/query",
        "cache": "poi_cache.geojson",
        "description": "Points of interest (walkability amenity proxy)",
    },
}

# ── ION LRT Station Fallback Data ─────────────────────────────────────────
# The 19 ION stations with WGS84 coordinates, sourced from GRT/Region of
# Waterloo public data. Used when no ArcGIS endpoint is available.
ION_STATIONS_FALLBACK = [
    {"name": "Conestoga", "lat": 43.4985, "lon": -80.5292},
    {"name": "Northfield", "lat": 43.4949, "lon": -80.5264},
    {"name": "Research and Technology", "lat": 43.4929, "lon": -80.5259},
    {"name": "University of Waterloo", "lat": 43.4736, "lon": -80.5414},
    {"name": "Laurier/Waterloo Park", "lat": 43.4672, "lon": -80.5280},
    {"name": "Waterloo Public Square", "lat": 43.4637, "lon": -80.5223},
    {"name": "Willis Way", "lat": 43.4617, "lon": -80.5197},
    {"name": "Allen", "lat": 43.4576, "lon": -80.5157},
    {"name": "Grand River Hospital", "lat": 43.4534, "lon": -80.5120},
    {"name": "Central Station", "lat": 43.4502, "lon": -80.4987},
    {"name": "Victoria Park", "lat": 43.4481, "lon": -80.4923},
    {"name": "Kitchener City Hall", "lat": 43.4516, "lon": -80.4884},
    {"name": "Frederick", "lat": 43.4500, "lon": -80.4746},
    {"name": "Queen", "lat": 43.4478, "lon": -80.4657},
    {"name": "Borden", "lat": 43.4463, "lon": -80.4558},
    {"name": "Mill", "lat": 43.4396, "lon": -80.4346},
    {"name": "Block Line", "lat": 43.4282, "lon": -80.4319},
    {"name": "Fairway", "lat": 43.4172, "lon": -80.4302},
]

CACHE_DIR = Path(__file__).parent / "cache"


# ---------------------------------------------------------------------------
# Core Fetch Logic
# ---------------------------------------------------------------------------
def fetch_arcgis_geojson(
    query_url: str,
    where: str = "1=1",
    out_fields: str = "*",
    max_records: int = 32000,
    batch_size: int = 2000,
) -> dict:
    """
    Fetch all records from an ArcGIS REST FeatureServer query endpoint,
    handling pagination (ArcGIS caps results at `maxRecordCount` per request).

    Returns a GeoJSON FeatureCollection dict.
    """
    all_features = []
    offset = 0

    while True:
        params = {
            "where": where,
            "outFields": out_fields,
            "f": "geojson",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": batch_size,
            "resultOffset": offset,
        }

        resp = requests.get(query_url, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)
        print(f"  Fetched {len(all_features)} records so far...")

        # ArcGIS signals "no more" by returning fewer than requested
        if len(features) < batch_size:
            break

        offset += batch_size

        if len(all_features) >= max_records:
            print(f"  Hit max_records cap ({max_records}), stopping.")
            break

        time.sleep(0.25)  # be polite to the server

    return {
        "type": "FeatureCollection",
        "features": all_features,
    }


def try_endpoint_candidates(
    base_org_url: str,
    candidates: list[str],
    layer_id: int = 0,
) -> Optional[str]:
    """
    Try multiple service name candidates to find which one exists.
    Returns the working query URL, or None.
    """
    for name in candidates:
        url = f"{base_org_url}/{name}/FeatureServer/{layer_id}"
        try:
            resp = requests.get(url, params={"f": "pjson"}, timeout=10)
            if resp.status_code == 200:
                meta = resp.json()
                if "error" not in meta:
                    print(f"  Found working endpoint: {name}")
                    return f"{url}/query"
        except requests.RequestException:
            continue
    return None


# ---------------------------------------------------------------------------
# Dataset Fetchers
# ---------------------------------------------------------------------------
def _build_ion_fallback_gdf() -> gpd.GeoDataFrame:
    """Build a GeoDataFrame of ION stations from hardcoded coordinates."""
    from shapely.geometry import Point

    features = []
    for stn in ION_STATIONS_FALLBACK:
        features.append({
            "geometry": Point(stn["lon"], stn["lat"]),
            "STATION_NAME": stn["name"],
        })
    gdf = gpd.GeoDataFrame(features, crs="EPSG:4326")
    print(f"  Built ION stations from fallback data: {len(gdf)} stations")
    return gdf


def _build_parcels_from_permits(permits_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Synthesize parcel-like data from building permits when no parcel layer
    is available. Each unique address becomes a "parcel" (point geometry)
    with aggregated attributes from all its permits.
    """
    from shapely.geometry import Point

    print("  Building synthetic parcels from building permits...")

    # De-duplicate by address to get one "parcel" per property
    if "ADDRESS" not in permits_gdf.columns:
        print("    WARNING: No ADDRESS column — using raw permit points")
        return permits_gdf

    # Group by address, take first geometry and aggregate attributes
    grouped = permits_gdf.groupby("ADDRESS", as_index=False).agg({
        "LONGITUDE": "first",
        "LATITUDE": "first",
        "PROPAREA": "first",           # lot area
        "CONTRVALUE": "sum",           # total construction value
        "ISSUE_YEAR": "min",           # oldest permit year → proxy for building age
        "SUBDESC": "first",            # primary building type
        "PERMITTYPE": "first",         # RE or NR
        "PERMIT_ID": "first",          # for use as OBJECTID
        "ADDRESS_ID": "first",
    })

    # Filter out rows with missing coordinates or outside Waterloo bounding box
    # Waterloo approx bounds: lat 43.42-43.54, lon -80.62 to -80.47
    valid_mask = (
        grouped["LONGITUDE"].notna() & 
        grouped["LATITUDE"].notna() &
        (grouped["LATITUDE"] >= 43.40) & 
        (grouped["LATITUDE"] <= 43.55) &
        (grouped["LONGITUDE"] >= -80.65) & 
        (grouped["LONGITUDE"] <= -80.45)
    )
    grouped = grouped[valid_mask].reset_index(drop=True)

    # Build point geometries for the valid rows
    geometry = [
        Point(lon, lat)
        for lon, lat in zip(grouped["LONGITUDE"], grouped["LATITUDE"])
    ]

    gdf = gpd.GeoDataFrame(grouped, geometry=geometry, crs="EPSG:4326")
    gdf["OBJECTID"] = range(1, len(gdf) + 1)

    print(f"  Synthesized {len(gdf)} parcels from {len(permits_gdf)} permits")
    return gdf


def fetch_and_cache(
    dataset_key: str,
    force_refresh: bool = False,
) -> gpd.GeoDataFrame:
    """
    Fetch a dataset, cache it locally, return as GeoDataFrame.
    Uses cached version if available (unless force_refresh=True).
    """
    config = ENDPOINTS[dataset_key]
    cache_path = CACHE_DIR / config["cache"]

    # Return cached version if it exists
    if cache_path.exists() and not force_refresh:
        print(f"[{dataset_key}] Loading from cache: {cache_path}")
        gdf = gpd.read_file(cache_path)
        print(f"  {len(gdf)} records, {list(gdf.columns)[:8]}...")
        return gdf

    # Special case: ION stations — no API endpoint on this org
    if dataset_key == "ion_stations" and config["url"] is None:
        print(f"[{dataset_key}] No API endpoint — using hardcoded station data")
        gdf = _build_ion_fallback_gdf()
        # Cache it
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        gdf.to_file(cache_path, driver="GeoJSON")
        return gdf

    # Fetch from API
    print(f"[{dataset_key}] Fetching from ArcGIS: {config['description']}")
    base_url = config["url"]

    # Some services (e.g., Parcel Fabric) have multiple layers — try each
    layer_ids = config.get("try_layer_ids", [None])
    geojson = None
    for layer_id in layer_ids:
        if layer_id is not None:
            query_url = f"{base_url}/{layer_id}/query"
        else:
            query_url = base_url

        try:
            result = fetch_arcgis_geojson(query_url)
            if result.get("features"):
                geojson = result
                print(f"  Success on layer {layer_id}: {len(geojson['features'])} features")
                break
            else:
                print(f"  Layer {layer_id}: 0 features, trying next...")
        except Exception as e:
            print(f"  Layer {layer_id} failed: {e}")
            continue

    if geojson is None or not geojson.get("features"):
        raise RuntimeError(
            f"Failed to fetch '{dataset_key}' from {base_url}\n"
            f"Tried layer IDs: {layer_ids}\n"
            f"Run `python data_ingest.py --discover` to check available services."
        )

    if not geojson.get("features"):
        print(f"  WARNING: {dataset_key} returned 0 features. Endpoint may be wrong.")

    # Cache to disk
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(geojson, f)
    print(f"  Cached {len(geojson['features'])} features to {cache_path}")

    # Convert to GeoDataFrame
    gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs="EPSG:4326")
    return gdf


def fetch_all(force_refresh: bool = False) -> dict[str, gpd.GeoDataFrame]:
    """
    Fetch all datasets. Returns dict of GeoDataFrames.

    Required: parcels, building_permits, ion_stations
    Optional: everything else (used to improve feature quality)
    """
    required_keys = ["parcels", "building_permits", "ion_stations"]
    optional_keys = [
        "buildings", "district_plans", "parks", "roads",
        "heritage_buildings", "points_of_interest", "major_dev",
    ]

    datasets = {}

    # Fetch required datasets (fail loudly)
    for key in required_keys:
        try:
            datasets[key] = fetch_and_cache(key, force_refresh=force_refresh)
        except Exception as e:
            print(f"  WARNING: Failed to fetch required dataset '{key}': {e}")
            datasets[key] = None

    # Fetch optional datasets (fail quietly)
    for key in optional_keys:
        try:
            datasets[key] = fetch_and_cache(key, force_refresh=force_refresh)
        except Exception as e:
            print(f"  [optional] Skipped {key}: {e}")
            datasets[key] = None

    # ── Fallback: synthesize parcels from building permits ──────────────
    if datasets.get("parcels") is None and datasets.get("building_permits") is not None:
        print("\n[parcels] Property_Fabric unavailable — synthesizing from building permits")
        datasets["parcels"] = _build_parcels_from_permits(datasets["building_permits"])
        # Cache the synthetic parcels
        cache_path = CACHE_DIR / "parcel_cache.geojson"
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        datasets["parcels"].to_file(cache_path, driver="GeoJSON")
        print(f"  Cached synthetic parcels to {cache_path}")

    loaded = sum(1 for v in datasets.values() if v is not None)
    print(f"\nLoaded {loaded}/{len(datasets)} datasets.")
    return datasets


# ---------------------------------------------------------------------------
# Endpoint Discovery Helper
# ---------------------------------------------------------------------------
def discover_endpoints():
    """
    Helper to list ALL available services on the Region of Waterloo
    ArcGIS org. Run this if you need to find the correct service names.
    """
    base = "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services"
    resp = requests.get(base, params={"f": "pjson"}, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    print("\n=== ALL AVAILABLE SERVICES ===")
    for svc in data.get("services", []):
        name = svc.get("name", "")
        stype = svc.get("type", "")
        print(f"  {name:50s}  [{stype}]")
    print(f"\nTotal: {len(data.get('services', []))} services")


# ---------------------------------------------------------------------------
# Print Summary
# ---------------------------------------------------------------------------
def print_summary(gdf: gpd.GeoDataFrame, label: str):
    """Print a concise summary of a GeoDataFrame."""
    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    print(f"  Records   : {len(gdf)}")
    print(f"  CRS       : {gdf.crs}")
    print(f"  Geom type : {gdf.geometry.geom_type.unique().tolist()}")
    print(f"  Bounds    : {gdf.total_bounds}")
    print(f"  Columns   : {list(gdf.columns)}")
    print()

    # Show a few sample values for each column
    for col in gdf.columns:
        if col == "geometry":
            continue
        nunique = gdf[col].nunique()
        sample = gdf[col].dropna().head(3).tolist()
        print(f"    {col:30s}  unique={nunique:>5d}  sample={sample}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    force = "--refresh" in sys.argv
    discover = "--discover" in sys.argv

    if discover:
        discover_endpoints()
        sys.exit(0)

    datasets = fetch_all(force_refresh=force)

    for key, gdf in datasets.items():
        if gdf is not None:
            print_summary(gdf, key.upper())
        else:
            print(f"\n[{key}] SKIPPED — fetch failed")

    print("\n\nDone. Run with --discover to list all available GeoHub services.")
    print("Run with --refresh to force re-fetch from API.")
