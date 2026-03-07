"""
Run this first to see the exact fields available in the Building Permits dataset.
Usage: python probe_schema.py
"""
import requests
import json

BASE_URL = (
    "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/"
    "City_of_Waterloo_Building_Permits/FeatureServer/0"
)

def probe_layer_metadata():
    """Fetch the layer definition to see all field names and types."""
    resp = requests.get(BASE_URL, params={"f": "pjson"})
    resp.raise_for_status()
    meta = resp.json()

    print("=" * 60)
    print(f"Layer Name : {meta.get('name')}")
    print(f"Geometry   : {meta.get('geometryType')}")
    print(f"Record Count (approx): {meta.get('maxRecordCount')}")
    print("=" * 60)
    print("\nFIELDS:")
    print("-" * 60)
    for f in meta.get("fields", []):
        print(f"  {f['name']:40s}  {f['type']}")
    print()

def probe_sample_records(n=3):
    """Fetch a few records so you can see real values."""
    resp = requests.get(
        f"{BASE_URL}/query",
        params={
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "resultRecordCount": n,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    print(f"\nSAMPLE RECORDS ({n}):")
    print("=" * 60)
    for i, feat in enumerate(data.get("features", [])):
        print(f"\n--- Feature {i+1} ---")
        for k, v in feat["properties"].items():
            print(f"  {k:40s}  {v}")
        geom = feat.get("geometry", {})
        print(f"  {'[geometry type]':40s}  {geom.get('type')}")
        if geom.get("coordinates"):
            coords = geom["coordinates"]
            # Handle point vs polygon
            if geom["type"] == "Point":
                print(f"  {'[coords]':40s}  {coords}")
            else:
                print(f"  {'[first coord]':40s}  {str(coords[0][0])[:60]}...")

if __name__ == "__main__":
    probe_layer_metadata()
    probe_sample_records()
