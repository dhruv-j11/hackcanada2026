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

# Default feature weights for weighted-sum mode (used when no category specified)
DEFAULT_WEIGHTS = {
    "distance_to_nearest_ion_station": 0.30,  # inverted: closer = higher
    "current_vs_permitted_far_ratio": 0.25,   # higher unused = higher score
    "lot_area_sqm": 0.20,                     # larger = higher
    "current_building_age": 0.10,             # older = higher
    "current_use_vs_zoned_use_mismatch": 0.10, # mismatch = higher
    "walkability_proxy": 0.05,                 # more walkable = higher
}

# ---------------------------------------------------------------------------
# Category-Specific Weight Profiles
# ---------------------------------------------------------------------------
# Each category has:
#   - weights: scoring weights tuned for that development type
#   - description: what this category represents (for LLM classification)
#   - keywords: terms an LLM can match against in user prompts
#   - examples: sample user prompts that should map to this category
#
# The LLM should classify a user's prompt into one of these categories,
# then the corresponding weights are applied for scoring.
# ---------------------------------------------------------------------------
CATEGORY_WEIGHT_PROFILES = {
    "residential": {
        "weights": {
            "distance_to_nearest_ion_station": 0.30,
            "current_vs_permitted_far_ratio": 0.15,
            "lot_area_sqm": 0.10,
            "current_building_age": 0.10,
            "current_use_vs_zoned_use_mismatch": 0.10,
            "walkability_proxy": 0.25,
        },
        "description": (
            "Residential development: apartments, condos, townhouses, "
            "single-family homes, student housing, seniors housing. "
            "Prioritizes walkability and transit access because residents "
            "need daily access to amenities, schools, and commute routes."
        ),
        "keywords": [
            "residential", "housing", "apartment", "condo", "townhouse",
            "dwelling", "home", "student housing", "seniors", "family",
            "live", "neighborhood", "subdivision",
        ],
        "examples": [
            "Where should I build a new apartment building?",
            "Find the best lots for residential development",
            "I want to build student housing near the university",
        ],
    },
    "commercial": {
        "weights": {
            "distance_to_nearest_ion_station": 0.15,
            "current_vs_permitted_far_ratio": 0.20,
            "lot_area_sqm": 0.30,
            "current_building_age": 0.10,
            "current_use_vs_zoned_use_mismatch": 0.15,
            "walkability_proxy": 0.10,
        },
        "description": (
            "Commercial development: retail stores, shopping centres, "
            "offices, restaurants, hotels, entertainment venues. "
            "Prioritizes lot size and road visibility for customer access "
            "and sufficient floor area for commercial operations."
        ),
        "keywords": [
            "commercial", "retail", "store", "shop", "office", "restaurant",
            "hotel", "mall", "plaza", "business", "storefront", "food",
        ],
        "examples": [
            "Where is the best location for a new shopping plaza?",
            "Find parcels suitable for office development",
            "I want to open a restaurant somewhere accessible",
        ],
    },
    "industrial": {
        "weights": {
            "distance_to_nearest_ion_station": 0.05,
            "current_vs_permitted_far_ratio": 0.25,
            "lot_area_sqm": 0.35,
            "current_building_age": 0.15,
            "current_use_vs_zoned_use_mismatch": 0.15,
            "walkability_proxy": 0.05,
        },
        "description": (
            "Industrial development: warehouses, manufacturing, logistics, "
            "distribution centres, workshops, tech manufacturing. "
            "Prioritizes large lot area and available density for heavy "
            "operations. Transit and walkability are less important."
        ),
        "keywords": [
            "industrial", "warehouse", "manufacturing", "factory", "logistics",
            "distribution", "workshop", "production", "storage", "yard",
        ],
        "examples": [
            "Where can I build a warehouse or distribution centre?",
            "Find large industrial lots for manufacturing",
            "Best sites for a logistics hub near Waterloo",
        ],
    },
    "mixed_use": {
        "weights": {
            "distance_to_nearest_ion_station": 0.25,
            "current_vs_permitted_far_ratio": 0.25,
            "lot_area_sqm": 0.15,
            "current_building_age": 0.10,
            "current_use_vs_zoned_use_mismatch": 0.10,
            "walkability_proxy": 0.15,
        },
        "description": (
            "Mixed-use development: buildings combining residential, "
            "commercial, and/or office uses. Ground-floor retail with "
            "apartments above, live-work spaces, urban villages. "
            "Balances transit access, walkability, and available density."
        ),
        "keywords": [
            "mixed use", "mixed-use", "live-work", "urban village",
            "ground floor retail", "multi-use", "combined", "hybrid",
        ],
        "examples": [
            "Where should I build a mixed-use development?",
            "Find parcels for a building with retail and apartments",
            "Best locations for live-work spaces near transit",
        ],
    },
    "institutional": {
        "weights": {
            "distance_to_nearest_ion_station": 0.25,
            "current_vs_permitted_far_ratio": 0.15,
            "lot_area_sqm": 0.20,
            "current_building_age": 0.05,
            "current_use_vs_zoned_use_mismatch": 0.05,
            "walkability_proxy": 0.30,
        },
        "description": (
            "Institutional development: schools, libraries, community centres, "
            "healthcare facilities, places of worship, government buildings. "
            "Prioritizes walkability and transit so the public can easily "
            "access these services. Lot size matters for parking and grounds."
        ),
        "keywords": [
            "institutional", "school", "library", "community centre",
            "hospital", "clinic", "healthcare", "church", "government",
            "public", "daycare", "recreation",
        ],
        "examples": [
            "Where should a new community centre be built?",
            "Find locations for a public library",
            "Best sites for a new school or daycare",
        ],
    },
}


def get_weights_for_category(category: str) -> dict:
    """
    Return the weight profile for a given category.
    Falls back to DEFAULT_WEIGHTS if category is not recognized.
    """
    profile = CATEGORY_WEIGHT_PROFILES.get(category.lower().replace("-", "_"))
    if profile:
        return profile["weights"]
    return dict(DEFAULT_WEIGHTS)


def get_category_definitions_for_llm() -> str:
    """
    Return a formatted string of all category definitions that can be
    injected into an LLM prompt for classification.

    The LLM should respond with exactly one of the category keys.
    """
    lines = [
        "Classify the user's prompt into exactly ONE of the following "
        "development categories. Respond with only the category key.\n"
    ]
    for key, profile in CATEGORY_WEIGHT_PROFILES.items():
        keywords = ", ".join(profile["keywords"][:8])
        lines.append(f"  {key}: {profile['description']}")
        lines.append(f"    Keywords: {keywords}")
        lines.append(f"    Example: \"{profile['examples'][0]}\"")
        lines.append("")
    return "\n".join(lines)

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


    # Feature 4: Building age (older = more redevelopment opportunity)
    if "current_building_age" in result.columns:
        contributions["building_age"] = (
            result["current_building_age"]
            * w["current_building_age"]
        )
    else:
        contributions["building_age"] = 0

    # Feature 5: Use mismatch (mismatch = opportunity)
    if "current_use_vs_zoned_use_mismatch" in result.columns:
        contributions["use_mismatch"] = (
            result["current_use_vs_zoned_use_mismatch"]
            * w["current_use_vs_zoned_use_mismatch"]
        )
    else:
        contributions["use_mismatch"] = 0

    # Feature 6: Walkability proxy (more walkable = better)
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
    for col in ["current_use_vs_zoned_use_mismatch"]:
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
    for col in ["current_use_vs_zoned_use_mismatch"]:
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
# Feature 2: K-Means Clustering (Development Archetypes)
# ---------------------------------------------------------------------------
def cluster_parcels(scored_gdf: gpd.GeoDataFrame, n_clusters: int = 6) -> gpd.GeoDataFrame:
    """
    Cluster all parcels into development archetypes using K-Means
    on their normalized feature vectors.
    """
    from sklearn.cluster import KMeans

    gdf = scored_gdf.copy()
    feature_cols = [c for c in NUMERIC_FEATURES if c in gdf.columns]
    if "current_use_vs_zoned_use_mismatch" in gdf.columns:
        feature_cols.append("current_use_vs_zoned_use_mismatch")

    X = gdf[feature_cols].fillna(0).values

    # Normalize for clustering (same MinMaxScaler approach)
    from sklearn.preprocessing import MinMaxScaler
    scaler = MinMaxScaler()
    X_norm = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_norm)
    gdf["cluster_id"] = labels

    # Auto-assign archetype names based on cluster centroid characteristics
    centroids = kmeans.cluster_centers_
    col_idx = {name: i for i, name in enumerate(feature_cols)}

    cluster_names = {}
    used_names = set()

    for cid in range(n_clusters):
        c = centroids[cid]
        ion_idx = col_idx.get("distance_to_nearest_ion_station")
        far_idx = col_idx.get("current_vs_permitted_far_ratio")
        lot_idx = col_idx.get("lot_area_sqm")
        walk_idx = col_idx.get("walkability_proxy")
        age_idx = col_idx.get("current_building_age")
        mismatch_idx = col_idx.get("current_use_vs_zoned_use_mismatch")

        ion_val = c[ion_idx] if ion_idx is not None else 0.5
        far_val = c[far_idx] if far_idx is not None else 0.5
        lot_val = c[lot_idx] if lot_idx is not None else 0.5
        walk_val = c[walk_idx] if walk_idx is not None else 0.5
        age_val = c[age_idx] if age_idx is not None else 0.5
        mismatch_val = c[mismatch_idx] if mismatch_idx is not None else 0

        # Score each archetype rule
        candidates = []
        if ion_val < 0.3 and far_val > 0.6:
            candidates.append(("Transit-Adjacent Sleepers", 1.0 - ion_val + far_val))
        if ion_val > 0.7 and lot_val > 0.6:
            candidates.append(("Suburban Holdouts", ion_val + lot_val))
        if walk_val > 0.6 and far_val < 0.3:
            candidates.append(("Urban Core Saturated", walk_val + (1 - far_val)))
        if age_val > 0.7 and far_val > 0.5:
            candidates.append(("Aging Opportunity", age_val + far_val))
        if mismatch_val > 0.5:
            candidates.append(("Zoning Mismatch", mismatch_val + far_val))
        candidates.append(("General Mixed", 0))  # fallback

        # Pick best unused name, or fallback
        candidates.sort(key=lambda x: x[1], reverse=True)
        for name, _ in candidates:
            if name not in used_names or name == "General Mixed":
                cluster_names[cid] = name
                used_names.add(name)
                break

    gdf["cluster_name"] = gdf["cluster_id"].map(cluster_names)

    # Store cluster metadata on the GDF attrs
    cluster_meta = []
    for cid in range(n_clusters):
        mask = gdf["cluster_id"] == cid
        cluster_gdf = gdf[mask]
        centroid_dict = {feature_cols[i]: round(float(centroids[cid][i]), 3)
                         for i in range(len(feature_cols))}

        # Identify dominant features (top 2 highest centroid values)
        sorted_feats = sorted(centroid_dict.items(), key=lambda x: x[1], reverse=True)
        dominant = [f[0].replace("_", " ").title() for f, _ in zip(sorted_feats[:2], range(2))]

        cluster_meta.append({
            "cluster_id": cid,
            "cluster_name": cluster_names.get(cid, "General Mixed"),
            "parcel_count": int(mask.sum()),
            "avg_score": round(float(cluster_gdf["score"].mean()), 1) if len(cluster_gdf) > 0 else 0,
            "dominant_features": dominant,
            "centroid": centroid_dict,
        })

    gdf.attrs["cluster_metadata"] = cluster_meta
    print(f"Clustered {len(gdf)} parcels into {n_clusters} archetypes: {cluster_names}")
    return gdf


# ---------------------------------------------------------------------------
# Feature 5: Enhanced Explainer — Unlock Suggestions
# ---------------------------------------------------------------------------
def generate_unlock_suggestions(
    row, scored_gdf: gpd.GeoDataFrame, weights: Optional[dict] = None
) -> dict:
    """
    For a given parcel row, generate:
    - constraints: what's holding it back (for Low-scoring parcels)
    - unlock_suggestions: what changes would improve it
    - strengths: what makes it high (for Prime parcels)
    - risks: potential issues (heritage, etc.)
    """
    w = weights or DEFAULT_WEIGHTS
    score = row.get("score", 0)
    tier = row.get("tier", "Unknown")

    constraints = []
    unlock_suggestions = []
    strengths = []
    risks = []

    # Compute percentiles for context
    for col in NUMERIC_FEATURES:
        if col in scored_gdf.columns:
            val = row.get(col)
            if val is not None and not (isinstance(val, float) and np.isnan(val)):
                pctile = (scored_gdf[col].dropna() < val).mean() * 100
                row_pctiles = row.get("_pctiles", {})
                row_pctiles[col] = pctile

    # ION distance analysis
    ion_dist = row.get("distance_to_nearest_ion_station")
    if ion_dist is not None and not np.isnan(ion_dist):
        ion_pctile = (scored_gdf["distance_to_nearest_ion_station"].dropna() < ion_dist).mean() * 100
        if ion_pctile > 70:
            constraints.append(
                f"{ion_dist:.0f}m from nearest ION station (bottom {100 - ion_pctile:.0f}% of all parcels)"
            )
            # Simulate a station 400m away
            delta = w.get("distance_to_nearest_ion_station", 0.30) * 100 * 0.7  # rough delta
            new_score = min(100, score + delta)
            unlock_suggestions.append(
                f"A new ION station within 400m would increase this score by "
                f"approximately {delta:.0f} points to {new_score:.1f}"
            )
        elif ion_pctile < 30:
            strengths.append(f"Only {ion_dist:.0f}m from nearest ION station (top {100 - ion_pctile:.0f}%)")

    # FAR ratio analysis
    far = row.get("current_vs_permitted_far_ratio")
    if far is not None and not np.isnan(far):
        used_pct = (1 - far) * 100
        if far < 0.2:
            constraints.append(
                f"Already {used_pct:.0f}% built out — limited unused density capacity"
            )
            unlock_suggestions.append(
                "Increasing the zoning height limit would unlock additional capacity"
            )
        elif far > 0.7:
            strengths.append(f"Only {used_pct:.0f}% of permitted density is used — significant room to grow")

    # Lot area analysis
    lot_area = row.get("lot_area_sqm")
    if lot_area is not None and not np.isnan(lot_area):
        if lot_area < 300:
            constraints.append(
                f"Lot area ({lot_area:.0f} sqm) is below threshold for efficient mid-rise construction"
            )
            unlock_suggestions.append(
                "Lot consolidation with adjacent parcels could improve viability"
            )
        elif lot_area > 2000:
            strengths.append(f"Large lot ({lot_area:.0f} sqm) supports substantial development")

    # Walkability analysis
    walk = row.get("walkability_proxy", 0)
    if walk is not None and walk < 2:
        constraints.append(
            "Few amenities within 800m — low walkability score"
        )
        unlock_suggestions.append(
            "Adding commercial or institutional uses nearby would improve walkability"
        )
    elif walk is not None and walk > 10:
        strengths.append(f"{walk:.0f} amenities within 800m — highly walkable")

    # Heritage risk
    heritage = row.get("heritage_adjacent", 0)
    heritage_name = row.get("nearest_heritage_name", "")
    heritage_dist = row.get("heritage_distance_m")
    if heritage:
        dist_str = f"{heritage_dist:.0f}m" if heritage_dist and not np.isnan(heritage_dist) else "nearby"
        risks.append(
            f"Adjacent to designated heritage property ({heritage_name}, {dist_str}) — "
            "Heritage Impact Assessment required, adding 6-12 months to planning timelines"
        )

    # Building age
    age = row.get("current_building_age")
    if age is not None and not np.isnan(age):
        if age > 50:
            strengths.append(f"Building age ({age:.0f} years) indicates strong redevelopment potential")

    result = {}
    if tier in ("Low Opportunity",):
        result["constraints"] = constraints
        result["unlock_suggestions"] = unlock_suggestions
    elif tier in ("Prime Opportunity", "High Opportunity"):
        result["strengths"] = strengths
        result["risks"] = risks
    else:
        # Moderate — show both
        result["constraints"] = constraints[:2]
        result["strengths"] = strengths[:2]

    return result


# ---------------------------------------------------------------------------
# Feature 6: Hypothetical ION Station Simulator
# ---------------------------------------------------------------------------
def simulate_new_station(
    scored_gdf: gpd.GeoDataFrame,
    new_station_lat: float,
    new_station_lon: float,
    ion_stations_gdf: gpd.GeoDataFrame,
    weights: Optional[dict] = None,
) -> gpd.GeoDataFrame:
    """
    Simulate adding a new ION station and recalculate all scores.
    Returns a copy of the GDF with new scores and a score_delta column.
    """
    from shapely.geometry import Point

    w = weights or DEFAULT_WEIGHTS
    gdf = scored_gdf.copy()
    old_scores = gdf["score"].copy()

    # Create new station point and append to ION stations
    new_point = gpd.GeoDataFrame(
        [{"STATION_NAME": "Hypothetical Station",
          "geometry": Point(new_station_lon, new_station_lat)}],
        crs="EPSG:4326"
    )
    expanded_stations = pd.concat([ion_stations_gdf, new_point], ignore_index=True)

    # Project everything to UTM
    gdf_proj = gdf.to_crs(epsg=32617)
    stations_proj = expanded_stations.to_crs(epsg=32617)

    # Recalculate distance_to_nearest_ion_station
    parcel_points = gdf_proj.copy()
    parcel_points["geometry"] = gdf_proj.geometry.representative_point()
    nearest = gpd.sjoin_nearest(
        parcel_points, stations_proj,
        how="left", distance_col="_new_ion_dist"
    )
    nearest = nearest[~nearest.index.duplicated(keep="first")]
    gdf["distance_to_nearest_ion_station"] = nearest["_new_ion_dist"].values

    # Re-score with the updated distances
    rescored = score_weighted_sum(gdf, weights=w)
    rescored["score_delta"] = (rescored["score"] - old_scores).round(1)
    rescored["old_score"] = old_scores

    return rescored


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
    top_3_contributing_features, ward, heritage, cluster, and geometry.
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

        props = {
            "parcel_id": parcel_id,
            "score": float(row["score"]),
            "tier": row["tier"],
            "tier_color": row["tier_color"],
            "top_3_contributing_features": [
                {"feature": name, "contribution": round(val, 2)}
                for name, val in top_3
            ],
            # Raw feature values
            "address": str(row.get("ADDRESS", "")),
            "lot_area_sqm": float(row.get("lot_area_sqm", 0)),
            "zoning_class": str(row.get("current_zoning_density_class", "")),
            "building_age": float(row.get("current_building_age", 0)),
            # Ward info (Feature 1)
            "ward_number": int(row.get("ward_number", 0)),
            "ward_name": str(row.get("ward_name", "Unknown")),
            "councillor_name": str(row.get("councillor_name", "Unknown")),
            # Heritage info (Feature 4)
            "heritage_adjacent": bool(row.get("heritage_adjacent", 0)),
            "nearest_heritage_name": str(row.get("nearest_heritage_name", "")),
            "heritage_distance_m": float(row.get("heritage_distance_m", 0))
                if not np.isnan(row.get("heritage_distance_m", 0)) else None,
            # Cluster info (Feature 2)
            "cluster_id": int(row.get("cluster_id", -1)),
            "cluster_name": str(row.get("cluster_name", "Unassigned")),
        }

        # Include score_delta if present (Feature 6 — simulation)
        if "score_delta" in gdf.columns:
            props["score_delta"] = float(row.get("score_delta", 0))
            props["old_score"] = float(row.get("old_score", 0))

        feature = {
            "type": "Feature",
            "geometry": row.geometry.__geo_interface__,
            "properties": props,
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
