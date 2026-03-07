"""
selective_llm_pipeline.py — Selectively pass building permit data to an LLM
based on a user-specified location.

STRATEGY OVERVIEW:
==================
The building permits dataset can have thousands of records. You DON'T want to
dump them all into an LLM context window. Instead, this module implements a
3-stage funnel:

  Stage 1: SPATIAL FILTER (ArcGIS server-side)
     Use the ArcGIS REST API's built-in geometry filter to only fetch permits
     within a radius of the user's location. This happens ON THE SERVER —
     you never download irrelevant records.

  Stage 2: ATTRIBUTE FILTER (local)
     After fetching, further prune by date range, permit type, status, or
     construction value to keep only what's contextually relevant.

  Stage 3: SUMMARIZE + TOKENIZE (pre-LLM)
     Convert the filtered records into a compact text representation that
     fits within your LLM's context budget. You control exactly how many
     tokens you spend on permit data vs. your system prompt and user query.

This means for a user asking "What's being built near University & King?",
you might go from 8,000 total permits → 47 within 500m → 12 after filtering
to recent + significant → ~1,200 tokens of structured context.
"""

import requests
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PERMITS_BASE_URL = (
    "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/"
    "City_of_Waterloo_Building_Permits/FeatureServer/0/query"
)

# Rough token budget for permit context (adjust based on your LLM model)
MAX_PERMIT_TOKENS = 2000  # ~2k tokens leaves plenty of room for prompts


@dataclass
class LocationQuery:
    """Represents a user's location-based query."""
    latitude: float
    longitude: float
    radius_m: float = 500.0          # search radius in metres
    permit_status: Optional[str] = None  # e.g., "Issued", "Complete"
    min_value: Optional[float] = None    # minimum construction value
    max_results: int = 50                # hard cap on records sent to LLM


# ---------------------------------------------------------------------------
# Stage 1: Server-Side Spatial Query
# ---------------------------------------------------------------------------
def fetch_permits_near(query: LocationQuery) -> dict:
    """
    Use ArcGIS REST API's geometry filter to fetch only permits
    within `radius_m` of the user's location.

    This is the KEY optimization — the filtering happens on Esri's server,
    so you only download what you need.
    """
    # ArcGIS geometry filter uses an envelope or point + distance
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson",
        "returnGeometry": "true",
        "resultRecordCount": min(query.max_results * 2, 1000),  # fetch extra for local filtering

        # --- SPATIAL FILTER: circle around the user's point ---
        "geometryType": "esriGeometryPoint",
        "geometry": json.dumps({
            "x": query.longitude,
            "y": query.latitude,
            "spatialReference": {"wkid": 4326}
        }),
        "spatialRel": "esriSpatialRelIntersects",
        "distance": query.radius_m,
        "units": "esriSRUnit_Meter",
        "inSR": "4326",
        "outSR": "4326",
    }

    # You can also push attribute filters server-side via the `where` clause
    where_clauses = ["1=1"]
    if query.permit_status:
        where_clauses.append(f"STATUS = '{query.permit_status}'")
    if query.min_value is not None:
        where_clauses.append(f"CONTRVALUE >= {query.min_value}")

    params["where"] = " AND ".join(where_clauses)

    resp = requests.get(PERMITS_BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Stage 2: Local Attribute Filtering & Ranking
# ---------------------------------------------------------------------------
def filter_and_rank(geojson: dict, query: LocationQuery) -> list[dict]:
    """
    Further filter and rank permits locally.
    Returns a list of permit dicts sorted by relevance (closest first).
    """
    features = geojson.get("features", [])
    results = []

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})

        # Calculate exact distance for ranking
        if geom and geom.get("type") == "Point":
            coords = geom["coordinates"]
            dist = _haversine(query.latitude, query.longitude, coords[1], coords[0])
        else:
            dist = 0  # polygon centroid calculation could go here

        results.append({
            "properties": props,
            "geometry": geom,
            "distance_m": round(dist, 1),
        })

    # Sort by distance (closest first)
    results.sort(key=lambda x: x["distance_m"])

    # Hard cap
    return results[:query.max_results]


def _haversine(lat1, lon1, lat2, lon2):
    """Distance in metres between two lat/lon points."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _normalize_date(val, issue_year=None) -> str:
    """
    Normalize ISSUEDATE from whatever format ArcGIS returns:
      - epoch ms (int/float): 1469750400000 -> "2016-07-29"
      - ISO string: "2016-07-29T00:00:00Z" -> "2016-07-29"
      - pre-formatted string: "July 29, 2016" -> kept as-is
      - None/empty: falls back to ISSUE_YEAR field if available
    """
    if val is None or str(val).strip() == "":
        return issue_year or "Unknown"

    # Case 1: epoch milliseconds
    if isinstance(val, (int, float)):
        try:
            dt = datetime.fromtimestamp(val / 1000, tz=timezone.utc)
            result = dt.strftime("%Y-%m-%d")
            # Sanity check against ISSUE_YEAR if available
            if issue_year and str(dt.year) != str(issue_year):
                # Epoch might be in seconds instead of ms, or data is off
                # Try treating as seconds
                try:
                    dt2 = datetime.fromtimestamp(val, tz=timezone.utc)
                    if str(dt2.year) == str(issue_year):
                        return dt2.strftime("%Y-%m-%d")
                except (ValueError, OSError):
                    pass
            return result
        except (ValueError, OSError):
            return issue_year or str(val)

    # Case 2: string — try parsing ISO format first
    val_str = str(val).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Case 3: already a readable string like "July 29, 2016" — keep it
    return val_str


# ---------------------------------------------------------------------------
# Stage 3: Compact Serialization for LLM Context
# ---------------------------------------------------------------------------
def permits_to_llm_context(permits: list[dict], token_budget: int = MAX_PERMIT_TOKENS) -> str:
    """
    Convert filtered permits into a compact string representation
    that fits within your token budget.

    STRATEGIES FOR STAYING WITHIN BUDGET:
    1. Only include the most relevant fields (not every ArcGIS attribute)
    2. Use compact formatting (no pretty JSON)
    3. Progressively truncate: full detail for top 5, summary for rest
    4. Count approximate tokens and stop when budget is hit
    """

    # Fields to extract (adjust once you see probe_schema.py output)
    KEY_FIELDS = [
        "PERMIT_NUM",    # permit ID
        "ADDRESS",       # street address
        "STATUS",        # Issued / Complete / Occupancy Final
        "PERMITTYPE",    # RE (residential) / NR (non-residential)
        "SUBDESC",       # e.g. "Single Detached Dwelling", "Multi-Use"
        "WORKDESC",      # e.g. "Addition", "NewBuilding", "InteriorWork"
        "CONTRVALUE",    # construction dollar value
        "ISSUEDATE",     # when issued (epoch ms → converted to YYYY-MM-DD)
        "PROPAREA",      # property area in sqm
        "DESCRIPTN",     # free-text description of work
    ]

    lines = []
    lines.append(f"=== {len(permits)} Building Permits Near Location ===\n")

    approx_tokens = 20  # header tokens
    for i, p in enumerate(permits):
        props = p["properties"]
        dist = p["distance_m"]

        # Build compact record
        record_parts = [f"#{i+1} ({dist}m away)"]
        for key in KEY_FIELDS:
            val = props.get(key)
            if val is not None and str(val).strip():
                # Convert ISSUEDATE to readable string — handles multiple formats:
                #   epoch ms (int):  1469750400000 -> "2016-07-29"
                #   ISO string:      "2016-07-29T00:00:00Z" -> "2016-07-29"
                #   pre-formatted:   "July 29, 2016" -> kept as-is
                if key == "ISSUEDATE":
                    val = _normalize_date(val, props.get("ISSUE_YEAR"))
                # Format dollar amounts
                if key == "CONTRVALUE" and isinstance(val, (int, float)):
                    val = f"${val:,.0f}"
                clean_key = key.replace("_", " ").title()
                record_parts.append(f"  {clean_key}: {val}")

        record_text = "\n".join(record_parts) + "\n"

        # Approximate token count (~4 chars per token)
        record_tokens = len(record_text) // 4
        if approx_tokens + record_tokens > token_budget:
            lines.append(f"\n[... {len(permits) - i} more permits truncated to fit context budget]")
            break

        lines.append(record_text)
        approx_tokens += record_tokens

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main Integration Function
# ---------------------------------------------------------------------------
def get_permit_context_for_llm(
    lat: float,
    lon: float,
    radius_m: float = 500.0,
    permit_status: Optional[str] = None,
    min_value: Optional[float] = None,
    max_results: int = 30,
    token_budget: int = MAX_PERMIT_TOKENS,
) -> str:
    """
    ONE-CALL FUNCTION: Give it a location, get back a string ready to
    inject into your LLM prompt.

    Usage in your FastAPI endpoint or chat handler:
        context = get_permit_context_for_llm(43.4643, -80.5204, radius_m=400)
        prompt = f"Based on these nearby permits:\\n{context}\\n\\nUser question: {user_msg}"
    """
    query = LocationQuery(
        latitude=lat,
        longitude=lon,
        radius_m=radius_m,
        permit_status=permit_status,
        min_value=min_value,
        max_results=max_results,
    )

    # Stage 1: Server-side spatial fetch
    raw_geojson = fetch_permits_near(query)

    # Stage 2: Local filter + rank
    permits = filter_and_rank(raw_geojson, query)

    # Stage 3: Compact serialization
    context_str = permits_to_llm_context(permits, token_budget)

    return context_str


# ---------------------------------------------------------------------------
# Example: How this plugs into your LLM call
# ---------------------------------------------------------------------------
def example_llm_integration():
    """
    Shows how you'd use this in practice with an LLM API.
    """
    # User says: "What's being developed near Waterloo Town Square?"
    # You geocode that to coords (or use a known landmark)
    user_lat, user_lon = 43.4643, -80.5204  # Waterloo Town Square area

    # Get compact permit context
    permit_context = get_permit_context_for_llm(
        lat=user_lat,
        lon=user_lon,
        radius_m=500,
        token_budget=2000,
    )

    print("PERMIT CONTEXT FOR LLM:")
    print("-" * 60)
    print(permit_context)
    print("-" * 60)
    print(f"Approx tokens: {len(permit_context) // 4}")

    # This is what your actual LLM call would look like:
    """
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(
        f"You are CityLens, an urban planning assistant for Waterloo, Ontario. "
        f"Use the provided building permit data to answer questions about "
        f"development activity in specific areas.\n\n"
        f"Here is building permit data near the location the user asked about:\n"
        f"{permit_context}\n\n"
        f"User question: What's being developed near Waterloo Town Square?"
    )
    print(response.text)
    """


if __name__ == "__main__":
    example_llm_integration()
