"""
census_parser.py — Parses City of Waterloo 2021 Census Profile PDF.

APPROACH: Every data table in the PDF has a Waterloo reference column with
known totals (121,435 for population, 47,040 for households, etc). We find
each section by matching these Waterloo anchors in order. This is immune
to pdfplumber text formatting differences — we only need the numeric rows.

Usage:
    python census_parser.py --pdf 2021-census-profiles-city-of-waterloo.pdf
    python census_parser.py --text raw_text.txt
    python census_parser.py --pdf FILE --debug
"""

import re
import json
import sys
import argparse
from pathlib import Path


# ─── Labels ───────────────────────────────────────────────────────────────────

AGE_GROUPS = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
    "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
    "65-69", "70-74", "75-79", "80-84", "85+"
]
HOUSEHOLD_SIZES = ["1_person", "2_persons", "3_persons", "4_persons", "5_or_more"]
MAINTAINER_AGES = ["15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75-84", "85+"]
DWELLING_TYPES = [
    "single_detached", "semi_detached", "row_house", "duplex",
    "apartment_5plus_storeys", "apartment_under_5_storeys", "other"
]
INDUSTRIES = [
    "agriculture_forestry", "mining_quarrying_oil_gas", "utilities",
    "construction", "manufacturing", "wholesale_trade", "retail_trade",
    "transportation_warehousing", "information_cultural", "finance_insurance",
    "real_estate_rental", "professional_scientific_technical",
    "management_of_companies", "admin_support_waste", "educational_services",
    "health_care_social_assistance", "arts_entertainment_recreation",
    "accommodation_food_services", "other_services", "public_administration"
]
EDUCATION_LEVELS = [
    "no_certificate", "high_school", "post_secondary_total",
    "apprenticeship_trades", "college_cegep",
    "university_below_bachelor", "bachelor_or_higher"
]
FAMILY_SIZES = ["2_person", "3_person", "4_person", "5_plus"]
IMMIGRANT_PERIODS = ["before_1980", "1980_1990", "1991_2000", "2001_2010", "2011_2021"]
IMMIGRANT_PLACES = ["americas", "europe", "africa", "asia", "oceania_other"]


# ─── Waterloo reference totals (for anchoring) ───────────────────────────────
# Each data block's first row has waterloo_total at 100.0%.
# Blocks with the same anchor (47,040) are disambiguated by order of appearance.

ANCHORS = {
    "population":       121435,   # 19 rows (1 total + 18 ages)
    "households":        47040,   # 6 rows (1 total + 5 sizes)  — 1st occurrence of 47040
    "marital_cl":        55545,   # 3 rows (total + married + not)
    "marital_detail":    48245,   # 5 rows (total + 4 statuses)
    "families":          31205,   # 5 rows (1 total + 4 sizes)
    "couple_families":   26790,   # 3 rows
    "one_parent":         4420,   # 3 rows
    "couples_children":  24310,   # 3 rows
    "hh_maintainer":     47040,   # 9 rows — 2nd occurrence of 47040
    "dwelling_type":     47040,   # 8 rows — 3rd occurrence of 47040
    "condo":             47040,   # 3 rows — 4th occurrence of 47040
    "core_housing":      44770,   # 3 rows
    "housing_indicators":47040,   # 10 rows — 5th occurrence of 47040
    "labour_force":     100820,   # 5 rows — 1st occurrence of 100820
    "industry":          65955,   # 22 rows (2 headers + 20 industries)
    "education":        100820,   # 8 rows — 2nd occurrence of 100820
    # tenure: extracted by regex (Owner/Renter prefixed lines)
    "immigration":      118390,   # 4 rows
    "imm_period":        32535,   # 6 rows (1 total + 5) — 1st occurrence of 32535
    "imm_place":         32535,   # 6 rows — 2nd occurrence of 32535
    "mobility":         113415,   # 3+ rows
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def cnum(s):
    if s is None:
        return 0.0
    s = str(s).strip()
    if not s or s in ("-", "…", "x", "F"):
        return 0.0
    return float(s.replace(",", "").replace("$", "").replace("%", "") or "0")


def extract_text_from_pdf(pdf_path):
    import pdfplumber
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        print(f"  PDF: {len(pdf.pages)} pages")
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


def find_data_rows(text):
    """Extract all 4-column numeric rows. Flexible regex for pdfplumber variations."""
    rows = []
    seen = set()
    
    for pat in [
        re.compile(r'([\d,]+)\s+([\d.]+)\s*%\s+([\d,]+)\s+([\d.]+)\s*%'),
        re.compile(r'([\d,]+)\s+([\d]+\.[\d]+)\s+([\d,]+)\s+([\d]+\.[\d]+)'),
    ]:
        for m in pat.finditer(text):
            pos = m.start()
            if any(abs(pos - s) < 5 for s in seen):
                continue
            seen.add(pos)
            rows.append({
                "d": cnum(m.group(1)),
                "dp": round(cnum(m.group(2)), 1),
                "w": cnum(m.group(3)),
                "wp": round(cnum(m.group(4)), 1),
                "pos": pos
            })
    
    rows.sort(key=lambda r: r["pos"])
    return rows


def find_anchor(rows, waterloo_val, n_rows, start_from=0, tolerance=500):
    """
    Find a block of n_rows whose first row has Waterloo value ≈ waterloo_val 
    and percent = 100.0. Search from start_from index onwards.
    Returns (block, next_index) or ([], start_from).
    """
    for i in range(max(0, start_from), len(rows)):
        r = rows[i]
        if abs(r["w"] - waterloo_val) < tolerance and r["dp"] == 100.0:
            block = rows[i:i + n_rows]
            return block, i + n_rows
    return [], start_from


def map_labels(block, labels, skip=1):
    """Map block rows to labels. skip=1 means first row is total."""
    result = {}
    for i, label in enumerate(labels):
        idx = skip + i
        if idx < len(block):
            result[label] = {
                "count": int(block[idx]["d"]),
                "percent": block[idx]["dp"]
            }
    return result


# ─── Parser ───────────────────────────────────────────────────────────────────

def parse_district(name, chunk):
    d = {"district_name": name}
    rows = find_data_rows(chunk)
    
    if not rows:
        return d
    
    idx = 0  # Tracks our position in the rows list
    
    # ── 1. POPULATION (anchor: 121,435, 19 rows) ────────────────────────────
    blk, idx = find_anchor(rows, 121435, 19, idx)
    if blk:
        d["total_population"] = int(blk[0]["d"])
        d["population_by_age"] = map_labels(blk, AGE_GROUPS)
    
    # Median age
    for pat in [r'(\d+\.?\d*)\s+36\b', r'Median Age[^\n]*?(\d+\.?\d+)']:
        m = re.search(pat, chunk)
        if m and 15 < float(m.group(1)) < 80:
            d["median_age"] = float(m.group(1))
            break
    
    # ── 2. HOUSEHOLDS (anchor: 47,040, 6 rows) — 1st of 47040 ──────────────
    blk, idx = find_anchor(rows, 47040, 6, idx)
    if blk:
        d["total_private_households"] = int(blk[0]["d"])
        d["households_by_size"] = map_labels(blk, HOUSEHOLD_SIZES)
    
    # Avg persons per HH
    for pat in [
        r'([\d,]+)\s*\n\s*(\d+\.\d+)\s*\n\s*118,?390\s*\n\s*3\.0',
        r'Average Persons[^\n]*?(\d+\.\d+)',
    ]:
        m = re.search(pat, chunk)
        if m:
            if m.lastindex == 2:
                d["total_persons_in_households"] = int(cnum(m.group(1)))
                d["avg_persons_per_household"] = float(m.group(2))
            else:
                d["avg_persons_per_household"] = float(m.group(1))
            break
    
    # ── 3. MARITAL STATUS married/CL (anchor: 55,545, 3 rows) ──────────────
    blk, idx = find_anchor(rows, 55545, 3, idx)
    if blk:
        d["marital_status"] = {
            "married_or_common_law": int(blk[0]["d"]),
            "married_or_common_law_pct": blk[0]["dp"],
        }
    
    # ── 4. MARITAL DETAIL (anchor: 48,245, 5 rows) ─────────────────────────
    blk, idx = find_anchor(rows, 48245, 5, idx)
    if blk:
        d.setdefault("marital_status", {}).update({
            "not_married_total": int(blk[0]["d"]),
            "married": int(blk[1]["d"]) if len(blk) > 1 else 0,
            "married_pct": blk[1]["dp"] if len(blk) > 1 else 0,
            "common_law": int(blk[2]["d"]) if len(blk) > 2 else 0,
            "common_law_pct": blk[2]["dp"] if len(blk) > 2 else 0,
            "never_married": int(blk[3]["d"]) if len(blk) > 3 else 0,
            "never_married_pct": blk[3]["dp"] if len(blk) > 3 else 0,
            "separated_divorced_widowed": int(blk[4]["d"]) if len(blk) > 4 else 0,
            "separated_divorced_widowed_pct": blk[4]["dp"] if len(blk) > 4 else 0,
        })
    
    # ── 5. CENSUS FAMILIES (anchor: 31,205, 5 rows) ────────────────────────
    blk, idx = find_anchor(rows, 31205, 5, idx)
    if blk:
        d["total_census_families"] = int(blk[0]["d"])
        d["families_by_size"] = map_labels(blk, FAMILY_SIZES)
    
    # ── 6. COUPLE FAMILIES (anchor: 26,790, 3 rows) ────────────────────────
    blk, idx = find_anchor(rows, 26790, 3, idx)
    if blk:
        d["couple_families"] = {
            "total": int(blk[0]["d"]),
            "married": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "common_law": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]} if len(blk) > 2 else {}
        }
    
    # ── 7. ONE-PARENT (anchor: 4,420, 3 rows) ──────────────────────────────
    blk, idx = find_anchor(rows, 4420, 3, idx)
    if blk:
        d["one_parent_families"] = {
            "total": int(blk[0]["d"]),
            "woman_parent": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "man_parent": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]} if len(blk) > 2 else {}
        }
    
    # ── 8. COUPLES W/WO CHILDREN (anchor: 24,310, 3 rows) ──────────────────
    blk, idx = find_anchor(rows, 24310, 3, idx)
    if blk:
        d["couples_children"] = {
            "total": int(blk[0]["d"]),
            "without_children": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "with_children": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]} if len(blk) > 2 else {}
        }
    
    # ── 9. AGE OF HH MAINTAINER (anchor: 47,040, 9 rows) — 2nd of 47040 ───
    blk, idx = find_anchor(rows, 47040, 9, idx)
    if blk:
        d["household_maintainer_age"] = map_labels(blk, MAINTAINER_AGES)
    
    # ── 10. DWELLING TYPE (anchor: 47,040, 8 rows) — 3rd of 47040 ──────────
    blk, idx = find_anchor(rows, 47040, 8, idx)
    if blk:
        d["total_dwellings"] = int(blk[0]["d"])
        d["dwellings_by_type"] = map_labels(blk, DWELLING_TYPES)
    
    # ── 11. CONDO STATUS (anchor: 47,040, 3 rows) — 4th of 47040 ───────────
    blk, idx = find_anchor(rows, 47040, 3, idx)
    if blk and len(blk) >= 3:
        d["condominium"] = {
            "is_condo": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]},
            "not_condo": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]}
        }
    
    # ── 12. CORE HOUSING NEED (anchor: 44,770, 3 rows) ─────────────────────
    blk, idx = find_anchor(rows, 44770, 3, idx)
    if blk and len(blk) >= 3:
        d["core_housing_need"] = {
            "total": int(blk[0]["d"]),
            "in_core_need": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]},
            "not_in_core_need": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]}
        }
    
    # ── 13. HOUSING INDICATORS (anchor: 47,040, 10 rows) — 5th of 47040 ────
    blk, idx = find_anchor(rows, 47040, 10, idx)
    if blk:
        d["housing_indicators"] = {
            "with_issues": {"count": int(blk[0]["d"]), "percent": blk[0]["dp"]},
            "spending_30pct_shelter": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "acceptable": {"count": int(blk[-1]["d"]), "percent": blk[-1]["dp"]}
        }
    
    # ── 14. LABOUR FORCE (anchor: 100,820, 5 rows) — 1st of 100820 ─────────
    blk, idx = find_anchor(rows, 100820, 5, idx)
    if blk:
        d["labour_force"] = {
            "population_15_plus": int(blk[0]["d"]),
            "in_labour_force": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "employed": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]} if len(blk) > 2 else {},
            "unemployed": {"count": int(blk[3]["d"]), "percent": blk[3]["dp"]} if len(blk) > 3 else {},
            "not_in_labour_force": {"count": int(blk[4]["d"]), "percent": blk[4]["dp"]} if len(blk) > 4 else {}
        }
        # Rates from text
        for label, key in [("Participation Rate", "participation_rate"),
                           ("Employment Rate", "employment_rate"),
                           ("Unemployment Rate", "unemployment_rate")]:
            m = re.search(rf'{label}\s*\n?\s*([\d.]+)', chunk)
            if m:
                try:
                    d["labour_force"][key] = float(m.group(1))
                except ValueError:
                    pass
    
    # ── 15. INDUSTRY (anchor: 65,955, 22 rows) ─────────────────────────────
    blk, idx = find_anchor(rows, 65955, 22, idx, tolerance=100)
    if not blk:
        # Try alternate: some districts might have slightly different total
        blk, idx = find_anchor(rows, 65955, 22, max(0, idx - 22), tolerance=1000)
    
    if blk:
        # First row is total, second might be "All Industries" sub-total
        # The 20 industry rows start at offset 2
        d["industry_breakdown"] = {}
        offset = 2
        for i, ind in enumerate(INDUSTRIES):
            if offset + i < len(blk):
                d["industry_breakdown"][ind] = {
                    "count": int(blk[offset + i]["d"]),
                    "percent": blk[offset + i]["dp"]
                }
    
    # ── 16. EDUCATION (anchor: 100,820, 8 rows) — 2nd of 100820 ────────────
    blk, idx = find_anchor(rows, 100820, 8, idx)
    if blk:
        d["education"] = map_labels(blk, EDUCATION_LEVELS)
    
    # ── 17. TENURE (Owner/Renter — text-prefixed, use regex) ────────────────
    for pat in [r'Owner\s+([\d,]+)\s+([\d.]+)\s*%?', r'Owner\s+([\d,]+)\s+([\d.]+)']:
        owner = re.search(pat, chunk)
        if owner:
            break
    for pat in [r'Renter\s+([\d,]+)\s+([\d.]+)\s*%?', r'Renter\s+([\d,]+)\s+([\d.]+)']:
        renter = re.search(pat, chunk)
        if renter:
            break
    if owner and renter:
        d["tenure"] = {
            "owner": {"count": int(cnum(owner.group(1))), "percent": cnum(owner.group(2))},
            "renter": {"count": int(cnum(renter.group(1))), "percent": cnum(renter.group(2))}
        }
    
    # Skip the tenure data rows in the sequence (1 total row)
    # The Owner/Renter lines with text don't match numeric regex
    # but there might be a total row with 47,040
    blk_skip, idx = find_anchor(rows, 47040, 1, idx)
    
    # ── 18. INCOME (dollar values from regex) ───────────────────────────────
    income = {}
    for pat, key in [
        (r'Median after-tax household income[^\$]*?\$([\d,]+)', 'median_after_tax_household_income'),
        (r'Average total income of household[^\$]*?\$([\d,]+)', 'average_total_household_income'),
        (r'Median total income of household[^\$]*?\$([\d,]+)', 'median_total_household_income'),
        (r'Average after-tax income of household[^\$]*?\$([\d,]+)', 'average_after_tax_household_income'),
    ]:
        m = re.search(pat, chunk)
        if m:
            income[key] = cnum(m.group(1))
    
    all_dollars = [cnum(v) for v in re.findall(r'\$([\d,]+)', chunk)]
    if all_dollars:
        income["raw_dollar_values"] = all_dollars
    
    if income:
        d["income"] = income
    
    # ── 19. IMMIGRATION (anchor: 118,390, 4 rows) ──────────────────────────
    blk, idx = find_anchor(rows, 118390, 4, idx)
    if blk and len(blk) >= 4:
        d["immigration"] = {
            "total": int(blk[0]["d"]),
            "non_immigrants": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]},
            "immigrants": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]},
            "non_permanent_residents": {"count": int(blk[3]["d"]), "percent": blk[3]["dp"]}
        }
    
    # ── 20. IMMIGRATION BY PERIOD (anchor: 32,535, 6 rows) — 1st ───────────
    blk, idx = find_anchor(rows, 32535, 6, idx)
    if blk:
        d["immigration_by_period"] = map_labels(blk, IMMIGRANT_PERIODS)
    
    # ── 21. IMMIGRATION BY PLACE (anchor: 32,535, 6 rows) — 2nd ────────────
    blk, idx = find_anchor(rows, 32535, 6, idx)
    if blk:
        d["immigration_by_place"] = map_labels(blk, IMMIGRANT_PLACES)
    
    # ── 22. MOBILITY (anchor: 113,415, 3 rows) ─────────────────────────────
    blk, idx = find_anchor(rows, 113415, 3, idx)
    if blk:
        d["mobility_5yr"] = {
            "total": int(blk[0]["d"]),
            "non_movers": {"count": int(blk[1]["d"]), "percent": blk[1]["dp"]} if len(blk) > 1 else {},
            "movers": {"count": int(blk[2]["d"]), "percent": blk[2]["dp"]} if len(blk) > 2 else {}
        }
        # Additional mobility sub-blocks
        remaining = rows[idx:idx + 9]
        sub_blocks = []
        for r in remaining:
            if r["dp"] == 100.0:
                break
            sub_blocks.append({"count": int(r["d"]), "percent": r["dp"]})
        if sub_blocks:
            d["mobility_5yr"]["detail"] = sub_blocks
    
    return d


# ─── Main ─────────────────────────────────────────────────────────────────────

def split_districts(text):
    pat = re.compile(r'Planning District Statistics:\s*(.+?)(?:\n|$)')
    matches = list(pat.finditer(text))
    result = {}
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        result[name] = text[start:end]
    return result


def main():
    ap = argparse.ArgumentParser()
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--pdf")
    grp.add_argument("--text")
    ap.add_argument("--output", default="waterloo_census_2021.json")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    text = extract_text_from_pdf(args.pdf) if args.pdf else Path(args.text).read_text(encoding="utf-8")
    print(f"Text: {len(text):,} chars")

    chunks = split_districts(text)
    print(f"Districts: {len(chunks)}")

    if args.debug and chunks:
        first = list(chunks.keys())[0]
        rows = find_data_rows(chunks[first])
        print(f"\n[DEBUG] '{first}' — {len(rows)} data rows:")
        for i, r in enumerate(rows[:30]):
            print(f"  {i:3d}: d={r['d']:>10.0f}  dp={r['dp']:>6.1f}%  w={r['w']:>10.0f}  wp={r['wp']:>6.1f}%")
        if len(rows) > 30:
            print(f"  ... ({len(rows) - 30} more)")
        print()

    parsed = []
    for name, chunk in chunks.items():
        data = parse_district(name, chunk)
        sections = sum(1 for k, v in data.items() if k != "district_name" and v)
        pop = data.get("total_population", "-")
        print(f"  {name:35s} | pop={str(pop):>7s} | {sections:>2d} sections")
        parsed.append(data)

    output = {
        "metadata": {
            "source": "City of Waterloo Growth Management, 2021 Census Profile",
            "census_year": 2021,
            "url": "https://www.waterloo.ca/media/3o5lqith/2021-census-profiles-city-of-waterloo.pdf",
            "parsed_date": "2026-03-07",
            "districts_parsed": len(parsed),
            "waterloo_reference": {
                "total_population": 121435,
                "total_households": 47040,
                "median_age": 36
            },
            "sections_per_district": [
                "total_population", "population_by_age", "median_age",
                "total_private_households", "households_by_size",
                "avg_persons_per_household", "marital_status",
                "total_census_families", "families_by_size",
                "couple_families", "one_parent_families", "couples_children",
                "household_maintainer_age", "total_dwellings", "dwellings_by_type",
                "condominium", "core_housing_need", "housing_indicators",
                "labour_force", "industry_breakdown", "education",
                "tenure", "income", "immigration", "immigration_by_period",
                "immigration_by_place", "mobility_5yr"
            ]
        },
        "districts": {d["district_name"]: d for d in parsed}
    }

    out_path = Path(args.output)
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nOutput: {out_path} ({out_path.stat().st_size:,} bytes)")

    # Validation table
    print(f"\n{'District':35s} | {'Pop':>7s} | {'HH':>6s} | {'Age':>4s} | {'Own%':>5s} | {'Dwell':>5s} | {'LF':>3s} | {'Edu':>3s} | {'Imm':>3s} | {'Mob':>3s}")
    print("-" * 100)
    for d in parsed:
        print(f"  {d['district_name']:33s} | "
              f"{str(d.get('total_population', '-')):>7s} | "
              f"{str(d.get('total_private_households', '-')):>6s} | "
              f"{str(d.get('median_age', '-')):>4s} | "
              f"{str(d.get('tenure', {}).get('owner', {}).get('percent', '-')):>5s} | "
              f"{'Y' if d.get('dwellings_by_type') else 'N':>5s} | "
              f"{'Y' if d.get('labour_force') else 'N':>3s} | "
              f"{'Y' if d.get('education') else 'N':>3s} | "
              f"{'Y' if d.get('immigration') else 'N':>3s} | "
              f"{'Y' if d.get('mobility_5yr') else 'N':>3s}")


if __name__ == "__main__":
    main()