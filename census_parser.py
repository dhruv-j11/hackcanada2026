"""
census_parser.py — Parses the City of Waterloo 2021 Census Profile PDF
into machine-readable JSON, one entry per Planning District.

Strategy: The PDF text extraction puts data rows (numbers) and label rows
(text) in a mixed order. We extract ALL 4-column numeric rows sequentially
and map them by position, since every district uses the same template.

Usage:
    python census_parser.py --pdf 2021-census-profiles-city-of-waterloo.pdf
    python census_parser.py --text raw_census_text.txt
"""

import re
import json
import sys
import argparse
from pathlib import Path


AGE_GROUPS = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
    "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
    "65-69", "70-74", "75-79", "80-84", "85+"
]
HOUSEHOLD_SIZES = ["1_person", "2_persons", "3_persons", "4_persons", "5_or_more"]
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
IMMIGRANT_PERIODS = ["before_1980", "1980_1990", "1991_2000", "2001_2010", "2011_2021"]
IMMIGRANT_PLACES = ["americas", "europe", "africa", "asia", "oceania_other"]


def extract_text_from_pdf(pdf_path):
    import pdfplumber
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


def cnum(s):
    """Clean number string → float."""
    if not s or s.strip() in ("-", "x", "F", ""):
        return 0.0
    return float(s.strip().replace(",", "").replace("$", "").replace("%", "") or "0")


def extract_data_rows(text):
    """Extract all lines matching: NUMBER PERCENT% NUMBER PERCENT%"""
    pat = re.compile(r'^\s*([\d,]+)\s+([\d.]+%)\s+([\d,]+)\s+([\d.]+%)\s*$', re.MULTILINE)
    return [
        {"d": cnum(m.group(1)), "dp": cnum(m.group(2)),
         "w": cnum(m.group(3)), "wp": cnum(m.group(4))}
        for m in pat.finditer(text)
    ]


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


def parse_district(name, chunk):
    rows = extract_data_rows(chunk)
    d = {"district_name": name}
    idx = 0

    def take(n):
        nonlocal idx
        r = rows[idx:idx + n]
        idx += n
        return r

    def si(row):
        return int(row["d"]) if row else 0

    # ── Population by Age: 1 total + 18 age groups = 19 ──
    blk = take(19)
    if len(blk) >= 19:
        d["total_population"] = si(blk[0])
        d["population_by_age"] = {
            g: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, g in enumerate(AGE_GROUPS) if i+1 < len(blk)
        }

    # Median age
    m = re.search(r'(\d+\.?\d*)\s+36\b', chunk)
    if m:
        d["median_age"] = float(m.group(1))

    # ── Households by Size: 1 total + 5 = 6 ──
    blk = take(6)
    if len(blk) >= 6:
        d["total_private_households"] = si(blk[0])
        d["households_by_size"] = {
            s: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, s in enumerate(HOUSEHOLD_SIZES) if i+1 < len(blk)
        }

    # Avg persons per HH
    m = re.search(r'([\d,]+)\s*\n\s*(\d+\.\d+)\s*\n\s*118,390\s*\n\s*3\.0', chunk)
    if m:
        d["total_persons_in_households"] = int(cnum(m.group(1)))
        d["avg_persons_per_household"] = float(m.group(2))

    # ── Marital block 1 (married/CL total): 3 rows ──
    m1 = take(3)

    # ── Marital block 2 (detail): 5 rows ──
    m2 = take(5)
    if len(m1) >= 1 and len(m2) >= 4:
        d["marital_status"] = {
            "married_or_common_law": si(m1[0]),
            "not_married_not_cl": si(m2[0]),
            "married": si(m2[1]) if len(m2) > 1 else 0,
            "common_law": si(m2[2]) if len(m2) > 2 else 0,
            "never_married": si(m2[3]) if len(m2) > 3 else 0,
            "separated_divorced_widowed": si(m2[4]) if len(m2) > 4 else 0
        }

    # ── Census Families: 1 + 4 = 5 ──
    blk = take(5)
    if len(blk) >= 5:
        d["total_census_families"] = si(blk[0])
        sizes = ["2_person", "3_person", "4_person", "5_plus"]
        d["families_by_size"] = {
            s: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, s in enumerate(sizes) if i+1 < len(blk)
        }

    # ── Couple Families: 3 ──
    blk = take(3)
    if len(blk) >= 3:
        d["couple_families"] = {
            "total": si(blk[0]),
            "married": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "common_law": {"count": si(blk[2]), "percent": blk[2]["dp"]}
        }

    # ── One-parent: 3 ──
    blk = take(3)
    if len(blk) >= 3:
        d["one_parent_families"] = {
            "total": si(blk[0]),
            "woman_parent": si(blk[1]),
            "man_parent": si(blk[2])
        }

    # ── Couples with/without children: 3 ──
    blk = take(3)
    if len(blk) >= 3:
        d["couples_children"] = {
            "without_children": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "with_children": {"count": si(blk[2]), "percent": blk[2]["dp"]}
        }

    # ── Age of HH Maintainer: 1 + 8 = 9 ──
    blk = take(9)
    if len(blk) >= 9:
        labels = ["15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75-84", "85+"]
        d["household_maintainer_age"] = {
            l: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, l in enumerate(labels) if i+1 < len(blk)
        }

    # ── Dwelling Type: 1 + 7 = 8 ──
    blk = take(8)
    if len(blk) >= 8:
        d["total_dwellings"] = si(blk[0])
        d["dwellings_by_type"] = {
            t: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, t in enumerate(DWELLING_TYPES) if i+1 < len(blk)
        }

    # ── Condo: 3 ──
    blk = take(3)
    if len(blk) >= 3:
        d["condominium"] = {
            "is_condo": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "not_condo": {"count": si(blk[2]), "percent": blk[2]["dp"]}
        }

    # ── Core Housing Need: 3 ──
    blk = take(3)
    if len(blk) >= 3:
        d["core_housing_need"] = {
            "in_core_need": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "not_in_core_need": {"count": si(blk[2]), "percent": blk[2]["dp"]}
        }

    # ── Housing Indicators: 10 ──
    blk = take(10)
    if len(blk) >= 2:
        d["housing_indicators"] = {
            "with_issues": {"count": si(blk[0]), "percent": blk[0]["dp"]},
            "acceptable": {"count": si(blk[-1]), "percent": blk[-1]["dp"]}
        }

    # ── Labour Force: 5 ──
    blk = take(5)
    if len(blk) >= 5:
        d["labour_force"] = {
            "population_15_plus": si(blk[0]),
            "in_labour_force": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "employed": {"count": si(blk[2]), "percent": blk[2]["dp"]},
            "unemployed": si(blk[3]),
            "not_in_labour_force": si(blk[4])
        }
        # Rates from text
        for label, key in [("Participation Rate", "participation_rate"),
                           ("Employment Rate", "employment_rate"),
                           ("Unemployment Rate", "unemployment_rate")]:
            rm = re.search(rf'{label}\s*\n?\s*([\d.]+)', chunk)
            if rm:
                d["labour_force"][key] = float(rm.group(1))

    # ── Industry: 2 + 20 = 22 ──
    blk = take(22)
    if len(blk) >= 22:
        d["industry_breakdown"] = {
            ind: {"count": si(blk[i+2]), "percent": blk[i+2]["dp"]}
            for i, ind in enumerate(INDUSTRIES) if i+2 < len(blk)
        }

    # ── Education: 1 + 7 = 8 ──
    blk = take(8)
    if len(blk) >= 8:
        d["education"] = {
            lvl: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, lvl in enumerate(EDUCATION_LEVELS) if i+1 < len(blk)
        }

    # ── Tenure (Owner/Renter from regex) ──
    own = re.search(r'Owner\s+([\d,]+)\s+([\d.]+%)', chunk)
    rent = re.search(r'Renter\s+([\d,]+)\s+([\d.]+%)', chunk)
    if own and rent:
        d["tenure"] = {
            "owner": {"count": int(cnum(own.group(1))), "percent": cnum(own.group(2))},
            "renter": {"count": int(cnum(rent.group(1))), "percent": cnum(rent.group(2))}
        }
    # Skip 1 tenure total row (Owner/Renter lines have text prefixes, not matched by regex)
    take(1)

    # ── Income (dollar values) ──
    dollars = [cnum(v) for v in re.findall(r'\$([\d,]+)', chunk)]
    if dollars:
        d["income"] = {"raw_dollar_values": dollars}
        # Try labeled extraction
        for pat, key in [
            (r'Median after-tax household income[^\$]*\$([\d,]+)', 'median_after_tax_household_income'),
            (r'Average total income of household[^\$]*\$([\d,]+)', 'average_total_household_income'),
            (r'Median total income of household[^\$]*\$([\d,]+)', 'median_total_household_income'),
            (r'Average after-tax income of household[^\$]*\$([\d,]+)', 'average_after_tax_household_income'),
        ]:
            rm = re.search(pat, chunk)
            if rm:
                d["income"][key] = cnum(rm.group(1))

    # ── Immigration Status: 4 ──
    blk = take(4)
    if len(blk) >= 4:
        d["immigration"] = {
            "total": si(blk[0]),
            "non_immigrants": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "immigrants": {"count": si(blk[2]), "percent": blk[2]["dp"]},
            "non_permanent_residents": {"count": si(blk[3]), "percent": blk[3]["dp"]}
        }

    # ── Immigration by Period: 1 + 5 = 6 ──
    blk = take(6)
    if len(blk) >= 6:
        d["immigration_by_period"] = {
            p: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, p in enumerate(IMMIGRANT_PERIODS) if i+1 < len(blk)
        }

    # ── Immigration by Place: 1 + 5 = 6 ──
    blk = take(6)
    if len(blk) >= 6:
        d["immigration_by_place"] = {
            p: {"count": si(blk[i+1]), "percent": blk[i+1]["dp"]}
            for i, p in enumerate(IMMIGRANT_PLACES) if i+1 < len(blk)
        }

    # ── Mobility: 3 (total + non-movers + movers) ──
    blk = take(3)
    if len(blk) >= 3:
        d["mobility_5yr"] = {
            "total": si(blk[0]),
            "non_movers": {"count": si(blk[1]), "percent": blk[1]["dp"]},
            "movers": {"count": si(blk[2]), "percent": blk[2]["dp"]}
        }

    # Remaining mobility sub-rows
    remaining_mobility = take(min(9, len(rows) - idx))
    if remaining_mobility:
        d["mobility_5yr"]["additional_rows"] = [
            {"count": si(r), "percent": r["dp"]} for r in remaining_mobility
        ]

    d["_rows_consumed"] = idx
    d["_rows_total"] = len(rows)
    return d


def main():
    ap = argparse.ArgumentParser(description="Parse Waterloo Census PDF → JSON")
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--pdf", help="Path to Census PDF")
    grp.add_argument("--text", help="Path to pre-extracted text")
    ap.add_argument("--output", default="waterloo_census_2021.json")
    args = ap.parse_args()

    if args.pdf:
        print(f"Extracting from PDF: {args.pdf}")
        text = extract_text_from_pdf(args.pdf)
    else:
        print(f"Reading: {args.text}")
        text = Path(args.text).read_text(encoding="utf-8")

    print(f"Text length: {len(text):,} chars")

    chunks = split_districts(text)
    print(f"\nFound {len(chunks)} districts:")

    parsed = []
    for name, chunk in chunks.items():
        data = parse_district(name, chunk)
        rc = data.get("_rows_consumed", 0)
        rt = data.get("_rows_total", 0)
        pop = data.get("total_population", "?")
        print(f"  {name:35s} | pop={str(pop):>7s} | rows={rc}/{rt}")
        parsed.append(data)

    # Build output
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
        "districts": {}
    }

    for d in parsed:
        d.pop("_rows_consumed", None)
        d.pop("_rows_total", None)
        output["districts"][d["district_name"]] = d

    out_path = Path(args.output)
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nOutput: {out_path} ({out_path.stat().st_size:,} bytes)")

    # Summary table
    print(f"\n{'District':35s} | {'Pop':>7s} | {'HH':>6s} | {'Age':>4s} | {'Own%':>5s} | {'Rent%':>5s}")
    print("-" * 75)
    for d in parsed:
        print(f"  {d['district_name']:33s} | "
              f"{str(d.get('total_population', '?')):>7s} | "
              f"{str(d.get('total_private_households', '?')):>6s} | "
              f"{str(d.get('median_age', '?')):>4s} | "
              f"{str(d.get('tenure', {}).get('owner', {}).get('percent', '?')):>5s} | "
              f"{str(d.get('tenure', {}).get('renter', {}).get('percent', '?')):>5s}")


if __name__ == "__main__":
    main()
