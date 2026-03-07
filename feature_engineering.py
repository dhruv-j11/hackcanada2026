"""
feature_engineering.py — Build the 10-feature matrix from raw GeoJSON data.

Takes the GeoDataFrames produced by data_ingest.py and engineers the features
specified in the ZoneWise scoring spec:

  1. distance_to_nearest_ion_station (metres)
  2. current_zoning_density_class (categorical)
  3. lot_area_sqm
  4. current_vs_permitted_far_ratio (0-1)
  5. is_within_water_capacity_freeze_zone (binary)
  6. proximity_to_major_road (metres)
  7. proximity_to_park_or_green_space (metres)
  8. current_building_age (years)
  9. current_use_vs_zoned_use_mismatch (binary)
  10. walkability_proxy (amenity density within 800m)

Usage:
    from data_ingest import fetch_all
    from feature_engineering import engineer_features

    datasets = fetch_all()
    feature_gdf = engineer_features(datasets)
"""

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from shapely.ops import nearest_points
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CURRENT_YEAR = datetime.now().year

# Zoning code -> density class mapping.
# Adjust these after inspecting your actual zoning data field values.
# Run `data_ingest.py` first and check the unique values in the zoning layer.
ZONING_DENSITY_MAP = {
    # Residential
    "R1": "single_family",
    "R2": "single_family",
    "R3": "low_rise",
    "R4": "low_rise",
    "R5": "low_rise",
    "R6": "mid_rise",
    "R7": "mid_rise",
    "R8": "mid_rise",
    "R9": "mid_rise",
    "RM": "mid_rise",
    "RMH": "mid_rise",
    # Commercial
    "C1": "commercial",
    "C2": "commercial",
    "C3": "commercial",
    "C4": "commercial",
    "C5": "commercial",
    "C6": "commercial",
    "C7": "commercial",
    "CC": "commercial",
    "CV": "commercial",
    # Mixed use / uptown
    "MU": "mixed_use",
    "MU1": "mixed_use",
    "MU2": "mixed_use",
    "U1": "mixed_use",
    "U2": "mixed_use",
    "U3": "mixed_use",
    # Industrial / Employment
    "E1": "commercial",
    "E2": "commercial",
    "E3": "commercial",
    "M1": "commercial",
    "M2": "commercial",
    # Open space
    "OS": "single_family",
    "P": "single_family",
}

# Maximum permitted FAR by density class (approximate Waterloo zoning bylaw values)
MAX_FAR_BY_DENSITY = {
    "single_family": 0.5,
    "low_rise": 1.0,
    "mid_rise": 2.5,
    "commercial": 3.0,
    "mixed_use": 4.0,
}

# Known water capacity freeze zone — approximate polygon for the areas under
# the Region's water/wastewater capacity moratorium.
# Update with actual geometry if available from the Region's open data.
# This is a rough bounding box for the affected area in west Waterloo.
WATER_FREEZE_ZONE_BBOX = {
    "min_lon": -80.58,
    "max_lon": -80.54,
    "min_lat": 43.44,
    "max_lat": 43.48,
}


# ---------------------------------------------------------------------------
# Feature Engineering Functions
# ---------------------------------------------------------------------------
def _compute_nearest_distance(
    parcels: gpd.GeoDataFrame,
    targets: gpd.GeoDataFrame,
    col_name: str,
) -> gpd.GeoDataFrame:
    """
    Compute distance from each parcel centroid to the nearest target point/polygon.
    Both GDFs must be in a projected CRS (metres) for accurate distances.
    """
    if targets is None or len(targets) == 0:
        parcels[col_name] = np.nan
        return parcels

    # Use representative point for polygon targets
    target_points = targets.geometry.representative_point()

    distances = []
    for parcel_geom in parcels.geometry:
        centroid = parcel_geom.representative_point()
        # Vectorized distance to all targets, take minimum
        dists = target_points.distance(centroid)
        distances.append(dists.min())

    parcels[col_name] = distances
    return parcels


def _compute_nearest_distance_fast(
    parcels: gpd.GeoDataFrame,
    targets: gpd.GeoDataFrame,
    col_name: str,
) -> gpd.GeoDataFrame:
    """
    Faster nearest-distance using sjoin_nearest (requires geopandas >= 0.10).
    Falls back to iterative method if sjoin_nearest is not available.
    """
    if targets is None or len(targets) == 0:
        parcels[col_name] = np.nan
        return parcels

    try:
        joined = gpd.sjoin_nearest(
            parcels[["geometry"]],
            targets[["geometry"]],
            how="left",
            distance_col=col_name,
        )
        # sjoin_nearest can produce duplicates; keep the closest
        joined = joined.loc[~joined.index.duplicated(keep="first")]
        parcels[col_name] = joined[col_name]
    except AttributeError:
        # Fallback for older geopandas
        parcels = _compute_nearest_distance(parcels, targets, col_name)

    return parcels


def engineer_features(
    datasets: dict[str, Optional[gpd.GeoDataFrame]],
) -> gpd.GeoDataFrame:
    """
    Main feature engineering pipeline.

    Args:
        datasets: dict with keys 'parcels', 'ion_stations', 'zoning',
                  'building_permits' — each a GeoDataFrame or None.

    Returns:
        GeoDataFrame with original parcel geometry + all engineered features.
    """
    parcels = datasets.get("parcels")
    ion_stations = datasets.get("ion_stations")
    zoning = datasets.get("district_plans")          # DistrictPlans as zoning proxy
    permits = datasets.get("building_permits")
    parks = datasets.get("parks")                     # Real Parks layer
    roads = datasets.get("roads")                     # Real Roads layer
    poi = datasets.get("points_of_interest")          # POI for walkability
    heritage = datasets.get("heritage_buildings")     # Heritage = old buildings

    if parcels is None or len(parcels) == 0:
        raise ValueError("Parcel data is required. Run data_ingest.py first.")

    print(f"Engineering features for {len(parcels)} parcels...")

    # ------------------------------------------------------------------
    # Project to UTM Zone 17N (EPSG:32617) for metre-based calculations
    # Waterloo, Ontario is in UTM zone 17N
    # ------------------------------------------------------------------
    def _to_utm(gdf):
        return gdf.to_crs(epsg=32617) if gdf is not None and len(gdf) > 0 else None

    parcels_proj = parcels.to_crs(epsg=32617)
    ion_proj = _to_utm(ion_stations)
    zoning_proj = _to_utm(zoning)
    permits_proj = _to_utm(permits)
    parks_proj = _to_utm(parks)
    roads_proj = _to_utm(roads)
    poi_proj = _to_utm(poi)
    heritage_proj = _to_utm(heritage)

    # ------------------------------------------------------------------
    # Feature 1: distance_to_nearest_ion_station (metres)
    # ------------------------------------------------------------------
    print("  [1/10] Distance to nearest ION station...")
    parcels_proj = _compute_nearest_distance_fast(
        parcels_proj, ion_proj, "distance_to_nearest_ion_station"
    )

    # ------------------------------------------------------------------
    # Feature 2: current_zoning_density_class (categorical)
    # ------------------------------------------------------------------
    print("  [2/10] Zoning density class...")
    if zoning_proj is not None and len(zoning_proj) > 0:
        # Spatial join: find which zone each parcel falls in
        # Use the parcel centroid for the join
        parcel_centroids = parcels_proj.copy()
        parcel_centroids["geometry"] = parcels_proj.geometry.representative_point()

        joined = gpd.sjoin(parcel_centroids, zoning_proj, how="left", predicate="within")

        # Look for the zoning code column (varies by dataset)
        zone_col = None
        for candidate in ["ZONE_CODE", "ZONING", "ZONE", "ZN_CODE", "ZONE_CLASS",
                          "ZONECODE", "zone_code", "zoning"]:
            if candidate in joined.columns:
                zone_col = candidate
                break

        if zone_col:
            # Map raw zoning codes to density classes
            joined["current_zoning_density_class"] = (
                joined[zone_col]
                .astype(str)
                .str.strip()
                .str.split("-").str[0]     # handle codes like "R5-2"
                .str.split(" ").str[0]     # handle codes like "R5 (H20)"
                .map(ZONING_DENSITY_MAP)
                .fillna("commercial")      # default for unmapped codes
            )
            parcels_proj["current_zoning_density_class"] = joined["current_zoning_density_class"].values
        else:
            print(f"    WARNING: Could not find zoning code column. Available: {list(zoning_proj.columns)}")
            parcels_proj["current_zoning_density_class"] = "commercial"
    else:
        parcels_proj["current_zoning_density_class"] = "commercial"

    # ------------------------------------------------------------------
    # Feature 3: lot_area_sqm
    # ------------------------------------------------------------------
    print("  [3/10] Lot area (sqm)...")
    # Try to use an existing area column, otherwise compute from geometry
    area_col = None
    for candidate in ["PROPAREA", "AREA", "AREA_SQM", "LOT_AREA", "Shape__Area",
                       "SHAPE_Area", "Shape_Area"]:
        if candidate in parcels_proj.columns:
            area_col = candidate
            break

    if area_col:
        parcels_proj["lot_area_sqm"] = parcels_proj[area_col].astype(float)
    else:
        # Compute from projected geometry
        parcels_proj["lot_area_sqm"] = parcels_proj.geometry.area

    # Fill NaN with median
    median_area = parcels_proj["lot_area_sqm"].median()
    parcels_proj["lot_area_sqm"] = parcels_proj["lot_area_sqm"].fillna(median_area)

    # ------------------------------------------------------------------
    # Feature 4: current_vs_permitted_far_ratio (0 = fully built, 1 = unused)
    # ------------------------------------------------------------------
    print("  [4/10] Current vs permitted FAR ratio...")
    # Get max permitted FAR based on zoning density class
    parcels_proj["max_permitted_far"] = (
        parcels_proj["current_zoning_density_class"]
        .map(MAX_FAR_BY_DENSITY)
        .fillna(2.0)
    )

    # Estimate current FAR from building permit data if available
    # Otherwise use a heuristic based on building footprint vs lot area
    if permits_proj is not None and len(permits_proj) > 0:
        # Count total construction value per parcel as a proxy for built density
        # Join permits to nearest parcel
        permit_values = gpd.sjoin_nearest(
            permits_proj[["geometry", "CONTRVALUE"]],
            parcels_proj[["geometry"]],
            how="left",
            max_distance=50,  # within 50m
        )
        if "CONTRVALUE" in permit_values.columns:
            # Aggregate construction value per parcel
            value_per_parcel = (
                permit_values.groupby("index_right")["CONTRVALUE"]
                .sum()
                .reindex(parcels_proj.index, fill_value=0)
            )
            # Normalize: higher construction value → more built out → lower unused ratio
            max_value = value_per_parcel.quantile(0.95)
            if max_value > 0:
                built_ratio = (value_per_parcel / max_value).clip(0, 1)
            else:
                built_ratio = 0.5
            parcels_proj["current_vs_permitted_far_ratio"] = 1.0 - built_ratio
        else:
            parcels_proj["current_vs_permitted_far_ratio"] = 0.5
    else:
        # Default: assume parcels are 50% utilized
        parcels_proj["current_vs_permitted_far_ratio"] = 0.5

    parcels_proj["current_vs_permitted_far_ratio"] = (
        parcels_proj["current_vs_permitted_far_ratio"].clip(0, 1)
    )

    # ------------------------------------------------------------------
    # Feature 5: is_within_water_capacity_freeze_zone (binary)
    # ------------------------------------------------------------------
    print("  [5/10] Water capacity freeze zone check...")
    # Convert parcel centroids back to WGS84 for bbox check
    centroids_wgs84 = parcels_proj.geometry.representative_point().to_crs(epsg=4326)
    bbox = WATER_FREEZE_ZONE_BBOX
    parcels_proj["is_within_water_capacity_freeze_zone"] = (
        (centroids_wgs84.x >= bbox["min_lon"]) &
        (centroids_wgs84.x <= bbox["max_lon"]) &
        (centroids_wgs84.y >= bbox["min_lat"]) &
        (centroids_wgs84.y <= bbox["max_lat"])
    ).astype(int)

    # ------------------------------------------------------------------
    # Feature 6: proximity_to_major_road (metres)
    # ------------------------------------------------------------------
    print("  [6/10] Proximity to major road...")
    if roads_proj is not None:
        # Filter to major roads using classification columns
        # Real data has: CARTO_CLASS (e.g., "Major Collector", "Minor Collector",
        # "Local Street"), MAIN_ROAD ("Y"/"N"), STREET_TYPE
        major_road_gdf = roads_proj
        for col in ["CARTO_CLASS", "CLASS", "ROAD_CLASS", "FUNC_CLASS"]:
            if col in roads_proj.columns:
                mask = roads_proj[col].astype(str).str.contains(
                    r"(?i)(arterial|collector|highway|major|regional|expressway)",
                    na=False,
                )
                if mask.any():
                    major_road_gdf = roads_proj[mask]
                    print(f"    Filtered to {len(major_road_gdf)} major roads (from {col})")
                break
        # Also try MAIN_ROAD flag if CARTO_CLASS didn't match
        if len(major_road_gdf) == len(roads_proj) and "MAIN_ROAD" in roads_proj.columns:
            mask = roads_proj["MAIN_ROAD"].astype(str).str.upper() == "Y"
            if mask.any():
                major_road_gdf = roads_proj[mask]
                print(f"    Filtered to {len(major_road_gdf)} main roads (from MAIN_ROAD)")

        parcels_proj = _compute_nearest_distance_fast(
            parcels_proj, major_road_gdf, "proximity_to_major_road"
        )
    else:
        # Fallback: address-based heuristic
        major_roads = ["KING", "UNIVERSITY", "WEBER", "COLUMBIA", "ERB",
                       "BRIDGEPORT", "FISCHER-HALLMAN", "IRA NEEDLES", "WESTMOUNT"]
        if "ADDRESS" in parcels_proj.columns:
            address_upper = parcels_proj["ADDRESS"].astype(str).str.upper()
            on_major_road = address_upper.apply(
                lambda a: any(road in a for road in major_roads)
            )
            parcels_proj["proximity_to_major_road"] = np.where(
                on_major_road, 0.0,
                np.clip(parcels_proj["lot_area_sqm"] * 0.3, 50, 500),
            )
        else:
            parcels_proj["proximity_to_major_road"] = 200.0

    # ------------------------------------------------------------------
    # Feature 7: proximity_to_park_or_green_space (metres)
    # ------------------------------------------------------------------
    print("  [7/10] Proximity to park/green space...")
    if parks_proj is not None and len(parks_proj) > 0:
        # We have the real Parks layer — use it directly
        print(f"    Using {len(parks_proj)} park polygons from Parks layer")
        parcels_proj = _compute_nearest_distance_fast(
            parcels_proj, parks_proj, "proximity_to_park_or_green_space"
        )
    elif zoning_proj is not None:
        # Fallback: try to find park zones in district plan data
        park_gdf = None
        for col in zoning_proj.columns:
            if col == "geometry":
                continue
            mask = zoning_proj[col].astype(str).str.contains(
                r"(?i)(park|open.?space|green|conservation)", na=False
            )
            if mask.sum() > 3:
                park_gdf = zoning_proj[mask]
                print(f"    Found {len(park_gdf)} park-like zones from {col}")
                break
        if park_gdf is not None:
            parcels_proj = _compute_nearest_distance_fast(
                parcels_proj, park_gdf, "proximity_to_park_or_green_space"
            )
        else:
            parcels_proj["proximity_to_park_or_green_space"] = 300.0
    else:
        parcels_proj["proximity_to_park_or_green_space"] = 300.0

    # ------------------------------------------------------------------
    # Feature 8: current_building_age (years)
    # ------------------------------------------------------------------
    print("  [8/10] Building age...")
    parcels_proj["current_building_age"] = np.nan

    # Source 1: Heritage buildings have CONST_DATE (e.g., "1896", "pre1855-66")
    if heritage_proj is not None and "CONST_DATE" in heritage_proj.columns:
        print("    Using heritage CONST_DATE for older buildings...")
        heritage_years = heritage_proj.copy()
        # Extract year: take first 4 digits from strings like "1896", "pre1855-66"
        heritage_years["_year"] = (
            heritage_years["CONST_DATE"]
            .astype(str)
            .str.extract(r"(\d{4})", expand=False)
        )
        heritage_years["_year"] = pd.to_numeric(heritage_years["_year"], errors="coerce")
        heritage_years = heritage_years.dropna(subset=["_year"])

        if len(heritage_years) > 0:
            joined = gpd.sjoin_nearest(
                heritage_years[["geometry", "_year"]],
                parcels_proj[["geometry"]],
                how="left",
                max_distance=100,
            )
            heritage_age = (
                joined.groupby("index_right")["_year"]
                .min()
                .reindex(parcels_proj.index)
            )
            parcels_proj["current_building_age"] = CURRENT_YEAR - heritage_age

    # Source 2: Fill remaining with oldest permit year
    if permits_proj is not None and "ISSUE_YEAR" in permits_proj.columns:
        still_nan = parcels_proj["current_building_age"].isna()
        if still_nan.any():
            print("    Filling remaining with permit ISSUE_YEAR...")
            permit_years = gpd.sjoin_nearest(
                permits_proj[["geometry", "ISSUE_YEAR"]],
                parcels_proj[["geometry"]],
                how="left",
                max_distance=50,
            )
            permit_years["_year"] = pd.to_numeric(
                permit_years["ISSUE_YEAR"].astype(str).str[:4], errors="coerce"
            )
            earliest = (
                permit_years.groupby("index_right")["_year"]
                .min()
                .reindex(parcels_proj.index)
            )
            permit_age = CURRENT_YEAR - earliest
            parcels_proj.loc[still_nan, "current_building_age"] = permit_age[still_nan]

    # Fill NaN with median age
    median_age = parcels_proj["current_building_age"].median()
    if pd.isna(median_age):
        median_age = 30.0
    parcels_proj["current_building_age"] = (
        parcels_proj["current_building_age"].fillna(median_age).clip(0, 200)
    )

    # ------------------------------------------------------------------
    # Feature 9: current_use_vs_zoned_use_mismatch (binary)
    # ------------------------------------------------------------------
    print("  [9/10] Use mismatch detection...")
    # Compare actual permit type against zoned density class
    # A single-family home in a mixed-use zone = mismatch (underutilized)
    if permits_proj is not None and "SUBDESC" in permits_proj.columns:
        permit_use = gpd.sjoin_nearest(
            permits_proj[["geometry", "SUBDESC"]],
            parcels_proj[["geometry", "current_zoning_density_class"]],
            how="left",
            max_distance=50,
        )
        # Detect mismatch: residential use in commercial/mixed zone
        residential_keywords = ["dwelling", "house", "residential", "detached", "semi"]
        if len(permit_use) > 0:
            is_residential_use = permit_use["SUBDESC"].astype(str).str.lower().apply(
                lambda s: any(kw in s for kw in residential_keywords)
            )
            is_higher_zone = permit_use["current_zoning_density_class"].isin(
                ["commercial", "mixed_use", "mid_rise"]
            )
            mismatch = (is_residential_use & is_higher_zone)

            # Aggregate to parcel level (any mismatch = 1)
            mismatch_per_parcel = (
                mismatch.groupby(permit_use["index_right"])
                .any()
                .reindex(parcels_proj.index, fill_value=False)
            )
            parcels_proj["current_use_vs_zoned_use_mismatch"] = mismatch_per_parcel.astype(int)
        else:
            parcels_proj["current_use_vs_zoned_use_mismatch"] = 0
    else:
        parcels_proj["current_use_vs_zoned_use_mismatch"] = 0

    # ------------------------------------------------------------------
    # Feature 10: walkability_proxy (amenity density within 800m)
    # ------------------------------------------------------------------
    print("  [10/10] Walkability proxy...")
    # Best source: PointsOfInterest layer (schools, shops, services, etc.)
    # Fallback: count non-residential permits within 800m
    amenity_source = None
    amenity_label = ""

    if poi_proj is not None and len(poi_proj) > 0:
        amenity_source = poi_proj
        amenity_label = f"{len(poi_proj)} Points of Interest"
    elif permits_proj is not None and "PERMITTYPE" in permits_proj.columns:
        nr_permits = permits_proj[
            permits_proj["PERMITTYPE"].astype(str) != "RE"
        ]
        if len(nr_permits) > 0:
            amenity_source = nr_permits
            amenity_label = f"{len(nr_permits)} non-residential permits"

    if amenity_source is not None and len(amenity_source) > 0:
        print(f"    Counting {amenity_label} within 800m of each parcel...")
        buffers = parcels_proj.geometry.representative_point().buffer(800)
        buffer_gdf = gpd.GeoDataFrame(geometry=buffers, crs=parcels_proj.crs)
        counts = gpd.sjoin(
            amenity_source[["geometry"]], buffer_gdf,
            how="inner", predicate="within",
        )
        amenity_counts = (
            counts.groupby("index_right").size()
            .reindex(parcels_proj.index, fill_value=0)
        )
        parcels_proj["walkability_proxy"] = amenity_counts
    else:
        parcels_proj["walkability_proxy"] = 0

    # ------------------------------------------------------------------
    # Convert back to WGS84 for output
    # ------------------------------------------------------------------
    result = parcels_proj.to_crs(epsg=4326)

    # List the feature columns we engineered
    feature_cols = [
        "distance_to_nearest_ion_station",
        "current_zoning_density_class",
        "lot_area_sqm",
        "current_vs_permitted_far_ratio",
        "is_within_water_capacity_freeze_zone",
        "proximity_to_major_road",
        "proximity_to_park_or_green_space",
        "current_building_age",
        "current_use_vs_zoned_use_mismatch",
        "walkability_proxy",
    ]

    print(f"\nFeature engineering complete. {len(result)} parcels × {len(feature_cols)} features.")
    print(f"Features: {feature_cols}")

    return result


# ---------------------------------------------------------------------------
# Main (standalone test)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import pandas as pd
    from data_ingest import fetch_all

    datasets = fetch_all()
    feature_gdf = engineer_features(datasets)

    # Print feature statistics
    feature_cols = [
        "distance_to_nearest_ion_station", "current_zoning_density_class",
        "lot_area_sqm", "current_vs_permitted_far_ratio",
        "is_within_water_capacity_freeze_zone", "proximity_to_major_road",
        "proximity_to_park_or_green_space", "current_building_age",
        "current_use_vs_zoned_use_mismatch", "walkability_proxy",
    ]

    print("\n=== FEATURE STATISTICS ===")
    for col in feature_cols:
        if col in feature_gdf.columns:
            if feature_gdf[col].dtype == "object":
                print(f"\n{col}:")
                print(feature_gdf[col].value_counts().head(10))
            else:
                print(f"\n{col}:")
                print(feature_gdf[col].describe())
