"""
scorer.py — Score parcels on a 0-100 development readiness scale.

Supports two scoring modes controlled by SCORING_MODE config:
  - "weighted_sum": Unsupervised weighted scoring (default, no training data needed)
  - "xgboost": Supervised XGBoost classifier (requires labeled historical data)

Usage:
    from scorer import score_parcels, explain_parcel

    scored_gdf = score_parcels(feature_gdf, mode="weighted_sum")
    explanation = explain_parcel(scored_gdf, parcel_id="12345")
"""

import json
import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.preprocessing import MinMaxScaler
from typing import Optional
from pathlib import Path

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCORING_MODE = "weighted_sum"  # "weighted_sum" | "xgboost"

# Default feature weights for weighted-sum mode
DEFAULT_WEIGHTS = {
    "distance_to_nearest_ion_station": 0.25,  # inverted: closer = higher
    "current_vs_permitted_far_ratio": 0.20,   # higher unused = higher score
    "lot_area_sqm": 0.15,                     # larger = higher
    "not_in_water_freeze": 0.15,              # not in freeze = higher
    "current_building_age": 0.10,             # older = higher
    "current_use_vs_zoned_use_mismatch": 0.10, # mismatch = higher
    "walkability_proxy": 0.05,                 # more walkable = higher
}

# Score tier boundaries
TIERS = [
    (0, 30, "Low Opportunity", "grey"),
    (31, 60, "Moderate Opportunity", "yellow"),
    (61, 80, "High Opportunity", "orange"),
    (81, 100, "Prime Opportunity", "red"),
]

# Numeric feature columns (used for normalization)
NUMERIC_FEATURES = [
    "distance_to_nearest_ion_station",
    "lot_area_sqm",
    "current_vs_permitted_far_ratio",
    "proximity_to_major_road",
    "proximity_to_park_or_green_space",
    "current_building_age",
    "walkability_proxy",
]

# Path to save/load XGBoost model
MODEL_PATH = Path(__file__).parent / "cache" / "xgboost_model.json"


# ---------------------------------------------------------------------------
# Weighted Sum Scoring
# ---------------------------------------------------------------------------
def _normalize_features(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Normalize all numeric features to 0-1 scale."""
    result = gdf.copy()
    scaler = MinMaxScaler()

    cols_to_scale = [c for c in NUMERIC_FEATURES if c in result.columns]
    if cols_to_scale:
        result[cols_to_scale] = scaler.fit_transform(
            result[cols_to_scale].fillna(result[cols_to_scale].median())
        )

    return result


def score_weighted_sum(
    gdf: gpd.GeoDataFrame,
    weights: Optional[dict] = None,
) -> gpd.GeoDataFrame:
    """
    Score parcels using a weighted sum of normalized features.
    Features are inverted where lower raw value = higher opportunity.
    """
    w = weights or DEFAULT_WEIGHTS
    result = _normalize_features(gdf)

    # Compute individual feature contributions
    contributions = pd.DataFrame(index=result.index)

    # Feature 1: ION station distance (INVERT — closer = better)
    if "distance_to_nearest_ion_station" in result.columns:
        contributions["distance_to_ion"] = (
            (1.0 - result["distance_to_nearest_ion_station"])
            * w["distance_to_nearest_ion_station"]
        )
    else:
        contributions["distance_to_ion"] = 0

    # Feature 2: Unused FAR ratio (higher unused = more opportunity)
    if "current_vs_permitted_far_ratio" in result.columns:
        contributions["unused_far"] = (
            result["current_vs_permitted_far_ratio"]
            * w["current_vs_permitted_far_ratio"]
        )
    else:
        contributions["unused_far"] = 0

    # Feature 3: Lot area (larger = more opportunity)
    if "lot_area_sqm" in result.columns:
        contributions["lot_area"] = (
            result["lot_area_sqm"]
            * w["lot_area_sqm"]
        )
    else:
        contributions["lot_area"] = 0

    # Feature 4: Not in water freeze zone
    if "is_within_water_capacity_freeze_zone" in result.columns:
        contributions["not_in_freeze"] = (
            (1 - result["is_within_water_capacity_freeze_zone"])
            * w["not_in_water_freeze"]
        )
    else:
        contributions["not_in_freeze"] = w["not_in_water_freeze"]

    # Feature 5: Building age (older = more redevelopment opportunity)
    if "current_building_age" in result.columns:
        contributions["building_age"] = (
            result["current_building_age"]
            * w["current_building_age"]
        )
    else:
        contributions["building_age"] = 0

    # Feature 6: Use mismatch (mismatch = opportunity)
    if "current_use_vs_zoned_use_mismatch" in result.columns:
        contributions["use_mismatch"] = (
            result["current_use_vs_zoned_use_mismatch"]
            * w["current_use_vs_zoned_use_mismatch"]
        )
    else:
        contributions["use_mismatch"] = 0

    # Feature 7: Walkability proxy (more walkable = better)
    if "walkability_proxy" in result.columns:
        contributions["walkability"] = (
            result["walkability_proxy"]
            * w["walkability_proxy"]
        )
    else:
        contributions["walkability"] = 0

    # Sum all contributions and scale to 0-100
    raw_score = contributions.sum(axis=1)
    max_possible = sum(w.values())
    score_0_100 = (raw_score / max_possible * 100).clip(0, 100).round(1)

    # Store scores and contributions on the GeoDataFrame
    gdf = gdf.copy()
    gdf["score"] = score_0_100
    gdf["tier"] = gdf["score"].apply(_score_to_tier)
    gdf["tier_color"] = gdf["score"].apply(_score_to_color)

    # Store individual contributions for explainability
    for col in contributions.columns:
        gdf[f"contrib_{col}"] = (contributions[col] / max_possible * 100).round(2)

    return gdf


# ---------------------------------------------------------------------------
# XGBoost Scoring
# ---------------------------------------------------------------------------
def train_xgboost(
    gdf: gpd.GeoDataFrame,
    label_col: str = "approved",
) -> "xgb.XGBClassifier":
    """
    Train an XGBoost classifier on labeled historical data.

    Args:
        gdf: GeoDataFrame with engineered features AND a label column
        label_col: name of the binary label column (1 = approved, 0 = rejected)

    Returns:
        Trained XGBClassifier
    """
    if not HAS_XGBOOST:
        raise ImportError("xgboost is required for SCORING_MODE='xgboost'. pip install xgboost")

    feature_cols = [c for c in NUMERIC_FEATURES if c in gdf.columns]
    # Add binary features
    for col in ["is_within_water_capacity_freeze_zone", "current_use_vs_zoned_use_mismatch"]:
        if col in gdf.columns:
            feature_cols.append(col)

    X = gdf[feature_cols].fillna(0)
    y = gdf[label_col]

    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X, y)

    # Save model
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(MODEL_PATH))
    print(f"XGBoost model saved to {MODEL_PATH}")

    return model


def score_xgboost(
    gdf: gpd.GeoDataFrame,
    model: Optional["xgb.XGBClassifier"] = None,
) -> gpd.GeoDataFrame:
    """
    Score parcels using a trained XGBoost model.
    Uses predicted probability as the score (0-100).
    """
    if not HAS_XGBOOST:
        raise ImportError("xgboost is required. pip install xgboost")

    if model is None:
        if MODEL_PATH.exists():
            model = xgb.XGBClassifier()
            model.load_model(str(MODEL_PATH))
        else:
            raise FileNotFoundError(
                f"No trained model found at {MODEL_PATH}. "
                f"Train first with train_xgboost() or use SCORING_MODE='weighted_sum'."
            )

    feature_cols = [c for c in NUMERIC_FEATURES if c in gdf.columns]
    for col in ["is_within_water_capacity_freeze_zone", "current_use_vs_zoned_use_mismatch"]:
        if col in gdf.columns:
            feature_cols.append(col)

    X = gdf[feature_cols].fillna(0)
    probabilities = model.predict_proba(X)[:, 1]  # probability of "approved"

    gdf = gdf.copy()
    gdf["score"] = (probabilities * 100).round(1)
    gdf["tier"] = gdf["score"].apply(_score_to_tier)
    gdf["tier_color"] = gdf["score"].apply(_score_to_color)

    # Feature importances for explainability
    importances = dict(zip(feature_cols, model.feature_importances_))
    gdf.attrs["feature_importances"] = importances

    return gdf


# ---------------------------------------------------------------------------
# Unified Scoring Interface
# ---------------------------------------------------------------------------
def score_parcels(
    gdf: gpd.GeoDataFrame,
    mode: Optional[str] = None,
    weights: Optional[dict] = None,
    xgb_model: Optional[object] = None,
) -> gpd.GeoDataFrame:
    """
    Score parcels using the configured scoring mode.

    Args:
        gdf: GeoDataFrame with engineered features
        mode: "weighted_sum" or "xgboost" (defaults to SCORING_MODE config)
        weights: custom weights for weighted_sum mode
        xgb_model: pre-loaded XGBoost model (optional)

    Returns:
        GeoDataFrame with 'score', 'tier', and contribution columns added.
    """
    mode = mode or SCORING_MODE

    if mode == "weighted_sum":
        return score_weighted_sum(gdf, weights=weights)
    elif mode == "xgboost":
        return score_xgboost(gdf, model=xgb_model)
    else:
        raise ValueError(f"Unknown SCORING_MODE: {mode}. Use 'weighted_sum' or 'xgboost'.")


# ---------------------------------------------------------------------------
# Explainability
# ---------------------------------------------------------------------------
def explain_parcel(scored_gdf: gpd.GeoDataFrame, parcel_idx: int) -> dict:
    """
    Generate a plain-English explanation of why a parcel scored the way it did.

    Args:
        scored_gdf: GeoDataFrame with scores and contribution columns
        parcel_idx: integer index of the parcel

    Returns:
        dict with 'score', 'tier', 'explanation' (string),
        'features' (dict of feature breakdowns), 'top_3' (list)
    """
    row = scored_gdf.iloc[parcel_idx]
    score = row.get("score", 0)
    tier = row.get("tier", "Unknown")

    # Collect feature contributions
    contrib_cols = [c for c in scored_gdf.columns if c.startswith("contrib_")]
    contributions = {}
    for col in contrib_cols:
        feature_name = col.replace("contrib_", "")
        contributions[feature_name] = round(row[col], 2)

    # Sort by contribution (highest first)
    sorted_contribs = sorted(contributions.items(), key=lambda x: x[1], reverse=True)
    top_3 = sorted_contribs[:3]

    # Build plain-English explanation
    address = row.get("ADDRESS", row.get("address", f"Parcel #{parcel_idx}"))

    explanation_parts = [
        f"{address} scores {score}/100 ({tier})."
    ]

    # Explain top contributing factors
    feature_explanations = {
        "distance_to_ion": _explain_ion_distance(row),
        "unused_far": _explain_far_ratio(row),
        "lot_area": _explain_lot_area(row),
        "not_in_freeze": _explain_water_freeze(row),
        "building_age": _explain_building_age(row),
        "use_mismatch": _explain_use_mismatch(row),
        "walkability": _explain_walkability(row),
    }

    reasons = []
    for feat_name, _ in top_3:
        if feat_name in feature_explanations:
            reasons.append(feature_explanations[feat_name])

    if reasons:
        explanation_parts.append(
            "This is primarily because " + "; ".join(reasons) + "."
        )

    return {
        "score": score,
        "tier": tier,
        "explanation": " ".join(explanation_parts),
        "features": dict(sorted_contribs),
        "top_3_contributing_features": [
            {"feature": name, "contribution": val} for name, val in top_3
        ],
    }


def _explain_ion_distance(row) -> str:
    dist = row.get("distance_to_nearest_ion_station", None)
    if dist is not None and not np.isnan(dist):
        # Un-normalize: rough estimate for explanation
        return f"it is approximately {dist:.0f}m from the nearest ION station"
    return "proximity to ION transit is favorable"


def _explain_far_ratio(row) -> str:
    ratio = row.get("current_vs_permitted_far_ratio", None)
    if ratio is not None and not np.isnan(ratio):
        used_pct = (1 - ratio) * 100
        return f"only {used_pct:.0f}% of permitted floor area ratio is currently used"
    return "significant unused development capacity exists"


def _explain_lot_area(row) -> str:
    area = row.get("lot_area_sqm", None)
    if area is not None and not np.isnan(area):
        return f"the lot is {area:.0f} sqm"
    return "the lot size supports development"


def _explain_water_freeze(row) -> str:
    in_freeze = row.get("is_within_water_capacity_freeze_zone", 0)
    if in_freeze:
        return "however, it is in the water capacity freeze zone (penalty applied)"
    return "it is outside the water capacity freeze zone"


def _explain_building_age(row) -> str:
    age = row.get("current_building_age", None)
    if age is not None and not np.isnan(age):
        built_year = 2026 - age
        return f"the existing structure dates to approximately {built_year:.0f}"
    return "the building age suggests redevelopment potential"


def _explain_use_mismatch(row) -> str:
    mismatch = row.get("current_use_vs_zoned_use_mismatch", 0)
    if mismatch:
        return "the current use is below the zoned potential"
    return "current use aligns with zoning"


def _explain_walkability(row) -> str:
    score = row.get("walkability_proxy", 0)
    if score > 0:
        return f"there are {score:.0f} nearby non-residential amenities"
    return "walkability data is limited"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _score_to_tier(score: float) -> str:
    for low, high, label, _ in TIERS:
        if low <= score <= high:
            return label
    return "Unknown"


def _score_to_color(score: float) -> str:
    for low, high, _, color in TIERS:
        if low <= score <= high:
            return color
    return "grey"


def scored_gdf_to_geojson(gdf: gpd.GeoDataFrame) -> dict:
    """
    Convert scored GeoDataFrame to GeoJSON FeatureCollection
    suitable for Mapbox GL JS rendering.

    Each feature includes: parcel_id, score, tier, tier_color,
    top_3_contributing_features, and geometry.
    """
    features = []
    for idx, row in gdf.iterrows():
        # Get top 3 contributions
        contrib_cols = [c for c in gdf.columns if c.startswith("contrib_")]
        contribs = {c.replace("contrib_", ""): row[c] for c in contrib_cols if not np.isnan(row[c])}
        top_3 = sorted(contribs.items(), key=lambda x: x[1], reverse=True)[:3]

        # Determine a parcel ID
        parcel_id = str(
            row.get("OBJECTID",
            row.get("parcel_id",
            row.get("PERMIT_ID", idx)))
        )

        feature = {
            "type": "Feature",
            "geometry": row.geometry.__geo_interface__,
            "properties": {
                "parcel_id": parcel_id,
                "score": float(row["score"]),
                "tier": row["tier"],
                "tier_color": row["tier_color"],
                "top_3_contributing_features": [
                    {"feature": name, "contribution": round(val, 2)}
                    for name, val in top_3
                ],
                # Include raw feature values for the popup/sidebar
                "address": str(row.get("ADDRESS", "")),
                "lot_area_sqm": float(row.get("lot_area_sqm", 0)),
                "zoning_class": str(row.get("current_zoning_density_class", "")),
                "building_age": float(row.get("current_building_age", 0)),
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


# ---------------------------------------------------------------------------
# Main (standalone test)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from data_ingest import fetch_all
    from feature_engineering import engineer_features

    # Fetch and engineer
    datasets = fetch_all()
    feature_gdf = engineer_features(datasets)

    # Score
    scored = score_parcels(feature_gdf, mode="weighted_sum")

    # Summary stats
    print("\n=== SCORING SUMMARY ===")
    print(f"Total parcels: {len(scored)}")
    print(f"Score distribution:\n{scored['score'].describe()}")
    print(f"\nTier breakdown:")
    print(scored["tier"].value_counts())

    # Example explanation
    if len(scored) > 0:
        # Find the highest-scored parcel
        best_idx = scored["score"].idxmax()
        explanation = explain_parcel(scored, best_idx)
        print(f"\n=== TOP SCORING PARCEL ===")
        print(explanation["explanation"])
        print(f"Features: {json.dumps(explanation['features'], indent=2)}")

    # Export GeoJSON sample
    geojson = scored_gdf_to_geojson(scored.head(100))
    out_path = Path(__file__).parent / "cache" / "scored_sample.geojson"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(geojson, f)
    print(f"\nSample GeoJSON saved to {out_path}")
