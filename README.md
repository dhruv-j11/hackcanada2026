# citylens.ai


AI Geomodeling Agent for Canadian Cities

Hack Canada 2026 · Waterloo, Ontario

Canada has the longest construction development approval time in North America, an embarrassing statistic for a first-world country. We need 5.8 million new homes by 2030, and these numbers are catching up to us. Worst of all? The mass public barely gets a say on what developments they really want.

## The Problem

Canada is in a housing crisis — but it's not the kind you fix with more construction crews.

In January 2026, the Region of Waterloo did something unprecedented: it **froze all new development approvals** because the existing water infrastructure couldn't keep up with growth. In a city where student rents have climbed from $601 to $950+ per month in under a decade. In a province where housing approval timelines stretch to 31 months and development charges have hit $59,600 per high-rise unit.

The real crisis isn't supply — it's **decision-making**.

Every zoning change in Canada triggers years of debate, millions in consulting fees, and final decisions made on gut instinct and political pressure. City councillors vote on rezoning applications without any tool that shows them the downstream consequences. Citizens show up to public meetings armed with opinions, but no data. Developers submit proposals into a black box.

**What if every zoning decision came with a simulation of its consequences?**

---

## What CityLens Does

CityLens is an AI-powered urban planning simulator that scores every parcel of land in Waterloo on a **0–100 development readiness scale**, then lets anyone — planners, councillors, citizens, developers — explore what their city could become.

Type a question in plain English. See the future.

> *"Build 6-storey housing on King Street."*

CityLens identifies the parcels, calculates the development based on real lot boundaries and zoning data, and generates the structures right on the map. Select any corridor and instantly see estimated housing capacity, population impact, tax revenue projections, transit ridership changes, heritage constraints, and ward-level councillor briefs — all grounded in **real open data** from the city you're standing in.

This isn't hypothetical. The backend is running right now with **17,717 scored parcels** covering the entire City of Waterloo.

---

## Features

### Parcel Opportunity Scoring
Every parcel gets a 0–100 score based on 9 engineered spatial features: distance to ION LRT stations, unused floor-area ratio, lot size, building age, zoning-use mismatch, walkability, proximity to parks, proximity to major roads, and zoning density class. Scores are categorized into four tiers — Low, Moderate, High, and Prime Opportunity — and rendered as a colour-gradient heatmap directly on the map.

### Natural Language City Building
Type a plain English prompt — *"Build 6-storey housing on King Street"* — and CityLens identifies the relevant parcels, calculates what that development would look like based on real lot boundaries and zoning data, and generates the 3D structures right on the map. One sentence in, a simulation of the future out. No GIS training, no planning degree, no consulting contract. Just a question and an answer you can see.

### Category-Aware Rescoring
Five development profiles — residential, commercial, industrial, mixed-use, and institutional — each apply a different weight vector to the scoring model. When a user types a natural language query, Gemini classifies it into the right category, the backend rescores all 17,717 parcels, and the map transforms to reflect what matters for that type of development. What's prime for student housing is different from what's prime for a grocery store.

### Development Archetype Clustering
K-Means clustering (k=6) identifies natural groupings across all parcels and labels them with descriptive archetype names: **Transit-Adjacent Sleepers** (close to ION, lots of unused density), **Suburban Holdouts** (large lots far from transit), **Zoning Mismatch** (parcels used below their zoned potential), and more. Planners get a vocabulary for neighbourhood patterns, not just individual scores.

### Ward & Councillor Integration
Every parcel knows its ward and sitting councillor. Select an area on the map and generate a **Community Development Brief** — a structured summary with total development capacity, estimated population increase, tax revenue, ION ridership impact, heritage constraints, and the councillors who represent that area. This is the document a citizen hands to their councillor.

### "Build This Block" Aggregate Analysis
Draw a rectangle on the map and get corridor-level planning intelligence: total parcels, tier and cluster breakdowns, estimated additional housing units, projected population increase, annual tax revenue, daily transit ridership impact, and the top 10 highest-opportunity parcels. This is what makes CityLens a planning tool, not just a heatmap.

### Hypothetical ION Station Simulator
Drop a new ION LRT station anywhere on the map. The system recalculates distance-to-station for all 17,717 parcels, rescores everything, and returns a before/after comparison — tier changes, most-improved parcels, and a full delta heatmap. This makes the value of transit investment tangible in a single click.

### Heritage Collision Detection
All 320 heritage buildings in Waterloo are buffered by 50 metres. Any high-scoring parcel within that radius gets flagged with the heritage property name and a note that development may require a Heritage Impact Assessment. A small feature to build, but it shows the tool understands real planning constraints.

### Census-Grounded Demographic Analysis
A custom parser extracts structured data from the City of Waterloo's 200-page 2021 Census Profile PDF — population by age, household sizes, dwelling types, tenure, income, industry, education, immigration, and core housing need — for 18 planning districts. When Gemini analyzes the impact of a proposed zoning change, it works with the **real demographics of that neighbourhood**, not generic assumptions.

### Enhanced Explainer: "Why Not Here?"
Low-scoring parcels explain what's holding them back and suggest what would fix it: *"If an ION station were built within 400m, this parcel's score would increase by approximately 22 points."* High-scoring parcels highlight strengths and flag risks. Every explanation includes ward, councillor, heritage status, cluster archetype, and district context.

### Gemini AI Impact Analysis
Propose a change — *"Replace this apartment with a grocery store"* — and Gemini generates a multi-dimensional impact analysis grounded in real census demographics: population displacement, housing supply loss, employment creation, tax revenue change, and neighbourhood character. The 3-stage LLM pipeline (spatial filter → attribute rank → token-budgeted serialization) ensures efficient token usage.

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                   │
│   React · Mapbox GL JS · Deck.gl · Recharts · ElevenLabs Voice     │
├─────────────────────────────────────────────────────────────────────┤
│                          API LAYER                                  │
│   FastAPI · Uvicorn · Pydantic · CORS                              │
├─────────────────────────────────────────────────────────────────────┤
│                       AI / ML LAYER                                 │
│   scikit-learn (MinMaxScaler, KMeans) · XGBoost · Google Gemini    │
├─────────────────────────────────────────────────────────────────────┤
│                     GEOSPATIAL ENGINE                               │
│   GeoPandas · Shapely · EPSG:32617 (UTM 17N) → EPSG:4326 (WGS84) │
├─────────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                   │
│   Region of Waterloo GeoHub (ArcGIS REST) · StatsCan Census 2021   │
│   City of Waterloo Open Data · CMHC Housing Data                   │
└─────────────────────────────────────────────────────────────────────┘
```

| Layer | Technologies |
|---|---|
| **Frontend** | React, Mapbox GL JS, Deck.gl, Recharts, ElevenLabs (voice I/O) |
| **API** | FastAPI, Uvicorn, Pydantic |
| **ML & Scoring** | scikit-learn (MinMaxScaler, KMeans), XGBoost (wired, ready for labeled data) |
| **Geospatial** | GeoPandas, Shapely, sjoin_nearest, UTM projections |
| **AI** | Google Gemini (category classification, impact analysis, natural language Q&A) |
| **Data** | 10 ArcGIS REST datasets, 2021 Census PDF (custom-parsed), cached as GeoJSON |
| **Voice** | ElevenLabs (bidirectional — speak queries, hear results) |


---

## API Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/parcels/scores` | All scored parcels as GeoJSON (main map source) |
| `GET` | `/parcels/{id}/explain` | Full parcel explanation with constraints/suggestions |
| `POST` | `/parcels/rescore-by-category` | Rescore by development type (residential, commercial, etc.) |
| `GET` | `/parcels/clusters` | 6 development archetypes with stats |
| `GET` | `/parcels/categories` | Category definitions + LLM classification prompt |
| `GET` | `/area/analyze` | "Build This Block" aggregate analysis for a bbox |
| `POST` | `/area/brief` | Community Development Brief for councillors |
| `POST` | `/simulate/ion-station` | Hypothetical ION station impact simulation |
| `POST` | `/analyze/impact` | Gemini-powered census-grounded impact analysis |
| `GET` | `/districts` | Planning district listing |
| `GET` | `/district/{name}/demographics` | Full 2021 Census profile for a district |
| `GET` | `/permits/nearby` | Building permits near a location |
| `POST` | `/permits/ask` | Natural language permit Q&A |
| `GET` | `/health` | Server status + data counts |

---

## Why This Matters for Canada

This project exists because of a specific Canadian failure.

Canada has some of the best open data infrastructure in the world. The Region of Waterloo publishes parcel boundaries, zoning maps, building permits, transit routes, heritage registries, and census profiles — all freely available through ArcGIS REST APIs and municipal open data portals. Statistics Canada publishes granular demographic data down to the dissemination area level. CMHC publishes housing starts, completions, and vacancy rates for every census metropolitan area.

**And yet no one has connected these datasets to help people make better planning decisions.**

The data exists. The computational tools exist. The AI capabilities exist. What's missing is a product that brings them together and makes them accessible to anyone who cares about how their city grows.

CityLens is that product.

A councillor in Ward 7 should be able to type *"Build mixed-use housing at King and University"* and see, in seconds, that the development could add 840 housing units, generate $2.1M in annual property tax revenue, and increase ION ridership by 400 daily trips — but that 3 of those parcels are within 50 metres of a heritage building and 7 would require parking variances.

A student paying $950/month in rent should be able to see which parcels near their campus score highest for residential development, who their councillor is, and generate a brief they can bring to a public meeting.

A developer should be able to simulate where a new ION station would have the most impact, see which clusters of parcels represent the best opportunity, and understand the demographic context of the neighbourhood they're proposing to build in.

**Every person in that hackathon room has been personally affected by Canada's housing crisis.** They've watched rent increase. They've watched buildings sit empty on approved lots. They've watched council debates end in stalemate.

CityLens gives them a tool to see what their city could look like if one zoning rule changed. With real numbers. On a real map. Of their real city.

---

<div align="center">

**CityLens** · Hack Canada 2026

*Envision with CityLens.*

Built with 🇨🇦 open data from the city we're standing in.

</div>

