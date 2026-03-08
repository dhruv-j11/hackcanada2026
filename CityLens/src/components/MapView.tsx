import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN, INITIAL_VIEW_STATE, MAP_STYLE,
  SCORE_COLOR_RAMP, SCORE_HEIGHT_EXPR, SLOT_MIDDLE, SLOT_TOP,
  ION_LINE_COLOR, ION_LINE_WIDTH, ION_GLOW_WIDTH, ION_GLOW_OPACITY, ION_STATION_RADIUS, ION_LINE_EMISSIVE_STRENGTH,
  PARCEL_OUTLINE_COLOR, PARCEL_OUTLINE_WIDTH, PARCEL_OUTLINE_OPACITY,
  PARCEL_3D_OPACITY, PARCEL_FLAT_OPACITY,
} from '../utils/mapConfig';
import { ionLineGeoJSON, ionStationsGeoJSON } from '../data/ionRoute';
import { fetchParcelScores } from '../services/apiService';
import type { IonSimulationResult } from '../services/apiService';
import type { SimulationResult } from '../services/geminiService';
import * as turf from '@turf/turf';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface MapViewProps {
  is3DMode: boolean;
  isLightMode: boolean;
  visibleLayers: {
    buildings: boolean;
    ionLine: boolean;
    ionStations: boolean;
    parcelScores: boolean;
  };
  resetTrigger: number;
  onParcelClick?: (parcelId: string) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  ionSimResult?: IonSimulationResult | null;
  ionSimMode?: boolean;
  ionSimClickedLocation?: { lat: number; lng: number } | null;
  drawAreaMode?: boolean;
  onBboxDraw?: (bbox: string) => void;
  showSimulation?: boolean;
  simulationResult?: SimulationResult | null;
  selectedParcelId?: string | null;
}

export default function MapView({
  is3DMode, isLightMode, visibleLayers, resetTrigger,
  onParcelClick, onMapClick, ionSimResult, ionSimMode, ionSimClickedLocation, drawAreaMode, onBboxDraw,
  showSimulation, simulationResult, selectedParcelId
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const drawStartRef = useRef<mapboxgl.LngLat | null>(null);
  const ionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const selectionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const parcelFeaturesRef = useRef<any[]>([]);

  // Refs for values used in callbacks (avoids stale closure)
  const isLightModeRef = useRef(isLightMode);
  const is3DModeRef = useRef(is3DMode);
  const ionSimModeRef = useRef(ionSimMode);
  const drawAreaModeRef = useRef(drawAreaMode);
  const onParcelClickRef = useRef(onParcelClick);
  const onMapClickRef = useRef(onMapClick);
  const onBboxDrawRef = useRef(onBboxDraw);

  useEffect(() => { isLightModeRef.current = isLightMode; }, [isLightMode]);
  useEffect(() => { is3DModeRef.current = is3DMode; }, [is3DMode]);
  useEffect(() => { ionSimModeRef.current = ionSimMode; }, [ionSimMode]);
  useEffect(() => { drawAreaModeRef.current = drawAreaMode; }, [drawAreaMode]);
  useEffect(() => { onParcelClickRef.current = onParcelClick; }, [onParcelClick]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onBboxDrawRef.current = onBboxDraw; }, [onBboxDraw]);

  // ─── INIT ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapContainer.current.innerHTML = '';

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE as mapboxgl.StyleSpecification,
      ...INITIAL_VIEW_STATE,
      antialias: true
    });

    map.current = m;

    // ──────────────────────────────────────────────────────
    // Shared function that adds ALL custom layers to the map.
    // Called by BOTH 'load' (initial) and 'style.load' (theme toggle).
    // ──────────────────────────────────────────────────────
    function addAllCustomLayers() {
      const light = isLightModeRef.current;

      // ── 1. ION LRT line ──
      if (!m.getSource('ion-route')) {
        m.addSource('ion-route', { type: 'geojson', data: ionLineGeoJSON });
      }
      if (!m.getLayer('ion-line-glow')) {
        m.addLayer({
          id: 'ion-line-glow', type: 'line', source: 'ion-route', slot: SLOT_MIDDLE,
          paint: { 'line-color': ION_LINE_COLOR, 'line-width': ION_GLOW_WIDTH, 'line-opacity': ION_GLOW_OPACITY, 'line-emissive-strength': ION_LINE_EMISSIVE_STRENGTH }
        });
      }
      if (!m.getLayer('ion-line-main')) {
        m.addLayer({
          id: 'ion-line-main', type: 'line', source: 'ion-route', slot: SLOT_MIDDLE,
          paint: { 'line-color': ION_LINE_COLOR, 'line-width': ION_LINE_WIDTH, 'line-emissive-strength': ION_LINE_EMISSIVE_STRENGTH }
        });
      }

      // ── 2. ION Stations ──
      if (!m.getSource('ion-stations')) {
        m.addSource('ion-stations', { type: 'geojson', data: ionStationsGeoJSON });
      }
      if (!m.getLayer('ion-station-points')) {
        m.addLayer({
          id: 'ion-station-points', type: 'circle', source: 'ion-stations', slot: SLOT_MIDDLE,
          paint: {
            'circle-radius': ION_STATION_RADIUS,
            'circle-color': ION_LINE_COLOR,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': light ? '#000000' : '#FFFFFF',
            'circle-emissive-strength': ION_LINE_EMISSIVE_STRENGTH
          }
        });
      }

      // ── 3. Load parcel scores (async) ──
      loadParcelScoresForMap(m);
    }

    // ──────────────────────────────────────────────────────
    // style.load fires on EVERY style load — initial AND theme toggle.
    // We add all custom layers here so they appear immediately on
    // page refresh and persist across theme changes.
    // ──────────────────────────────────────────────────────
    m.on('style.load', () => {
      addAllCustomLayers();
      setMapReady(true);
    });

    // ── Unified click handler ──
    // Finds the nearest parcel by coordinate distance (bypasses Mapbox layer query issues).
    m.on('click', (e: mapboxgl.MapMouseEvent) => {
      console.log('[MapView] click event fired', { lng: e.lngLat.lng, lat: e.lngLat.lat });

      // ION sim mode takes priority
      if (ionSimModeRef.current) {
        console.log('[MapView] ION sim mode active, forwarding to onMapClick');
        onMapClickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }
      if (drawAreaModeRef.current) {
        console.log('[MapView] draw area mode active, ignoring');
        return;
      }

      const clickLng = e.lngLat.lng;
      const clickLat = e.lngLat.lat;
      const features = parcelFeaturesRef.current;
      console.log('[MapView] parcelFeaturesRef count:', features.length);
      if (!features.length) {
        console.log('[MapView] no features stored, exiting');
        return;
      }

      // Find nearest parcel by centroid distance
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const f of features) {
        const geom = f.geometry;
        if (!geom) continue;
        let cx: number, cy: number;
        if (geom.type === 'Point') {
          cx = geom.coordinates[0];
          cy = geom.coordinates[1];
        } else if (geom.type === 'Polygon') {
          const ring = geom.coordinates[0];
          if (!ring || ring.length === 0) continue;
          cx = 0; cy = 0;
          for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
          cx /= ring.length; cy /= ring.length;
        } else if (geom.type === 'MultiPolygon') {
          const ring = geom.coordinates[0]?.[0];
          if (!ring || ring.length === 0) continue;
          cx = 0; cy = 0;
          for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
          cx /= ring.length; cy /= ring.length;
        } else {
          continue;
        }
        const dx = cx - clickLng;
        const dy = cy - clickLat;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestId = f.properties?.parcel_id;
        }
      }

      console.log('[MapView] nearest parcel:', { bestId, bestDist, sqrtDist: Math.sqrt(bestDist) });

      // Select if close enough (~200m in degrees)
      const maxDist = 0.002;
      if (bestId && bestDist < maxDist * maxDist) {
        console.log('[MapView] ✓ selecting parcel:', bestId);
        onParcelClickRef.current?.(bestId);

        // Remove existing selection marker
        if (selectionMarkerRef.current) {
          selectionMarkerRef.current.remove();
          selectionMarkerRef.current = null;
        }

        // Find the selected feature to get coordinates and score
        const selectedFeature = features.find((f: any) => f.properties?.parcel_id === bestId);
        if (selectedFeature?.geometry?.type === 'Point') {
          const [lng, lat] = selectedFeature.geometry.coordinates;
          const score = selectedFeature.properties?.score ?? 50;

          // Score-based color (matches SCORE_COLOR_RAMP tiers)
          const color = score >= 81 ? '#c62828'   // Prime — Red
                      : score >= 61 ? '#f57c00'   // High — Orange
                      : score >= 31 ? '#fdd835'   // Moderate — Yellow
                      : '#9e9e9e';                 // Low — Grey

          // Create pulsing selection marker
          const el = document.createElement('div');
          el.innerHTML = `
            <div style="
              width: 60px; height: 60px;
              border-radius: 50%;
              background: ${color}33;
              border: 4px solid ${color};
              box-shadow: 0 0 20px ${color}88, 0 0 40px ${color}44;
              animation: parcel-pulse 1.5s ease-in-out infinite;
              display: flex; align-items: center; justify-content: center;
              font-size: 14px; font-weight: bold; color: white;
              text-shadow: 0 1px 3px rgba(0,0,0,0.8);
            ">${Math.round(score)}</div>
            <style>
              @keyframes parcel-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.15); opacity: 0.85; }
              }
            </style>
          `;
          el.style.cursor = 'pointer';

          selectionMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(m);
        }

        if (m.getLayer('parcel-highlight')) {
          m.setFilter('parcel-highlight', ['==', ['get', 'parcel_id'], bestId]);
        }
      } else {
        console.log('[MapView] ✗ too far from any parcel (maxDist²:', maxDist * maxDist, ')');
        // Clicked too far from any parcel — clear highlight and marker
        if (selectionMarkerRef.current) {
          selectionMarkerRef.current.remove();
          selectionMarkerRef.current = null;
        }
        if (m.getLayer('parcel-highlight')) {
          m.setFilter('parcel-highlight', ['==', ['get', 'parcel_id'], '']);
        }
      }
    });

    // ── Reload scores on moveend ──
    m.on('moveend', () => {
      const bounds = m.getBounds();
      if (!bounds) return;
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      loadParcelScoresForMap(m, bbox);
    });

    // ── Bbox draw (for area analysis) ──
    const emptyRect: GeoJSON.Feature = {
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0,0],[0,0],[0,0],[0,0],[0,0]]] }
    };

    m.on('mousedown', (e: mapboxgl.MapMouseEvent) => {
      if (!drawAreaModeRef.current) return;
      drawStartRef.current = e.lngLat;
      m.getCanvas().style.cursor = 'crosshair';

      // Eagerly create draw-rect source + layers so mousemove can update
      if (!m.getSource('draw-rect')) {
        m.addSource('draw-rect', { type: 'geojson', data: emptyRect });
        m.addLayer({
          id: 'draw-rect-fill', type: 'fill', source: 'draw-rect', slot: SLOT_MIDDLE,
          paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.15 }
        });
        m.addLayer({
          id: 'draw-rect-line', type: 'line', source: 'draw-rect', slot: SLOT_MIDDLE,
          paint: { 'line-color': '#3B82F6', 'line-width': 2, 'line-dasharray': [3, 3] }
        });
      } else {
        (m.getSource('draw-rect') as mapboxgl.GeoJSONSource).setData(emptyRect);
      }
    });

    // Live rectangle preview while dragging
    m.on('mousemove', (e: mapboxgl.MapMouseEvent) => {
      if (!drawAreaModeRef.current || !drawStartRef.current) return;
      const start = drawStartRef.current;
      const cur = e.lngLat;
      const minLon = Math.min(start.lng, cur.lng);
      const minLat = Math.min(start.lat, cur.lat);
      const maxLon = Math.max(start.lng, cur.lng);
      const maxLat = Math.max(start.lat, cur.lat);
      const coords: [number, number][] = [
        [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]
      ];
      if (m.getSource('draw-rect')) {
        (m.getSource('draw-rect') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature', properties: {},
          geometry: { type: 'Polygon', coordinates: [coords] }
        });
      }
    });

    m.on('mouseup', (e: mapboxgl.MapMouseEvent) => {
      if (!drawAreaModeRef.current || !drawStartRef.current) return;
      const start = drawStartRef.current;
      const end = e.lngLat;
      drawStartRef.current = null;
      m.getCanvas().style.cursor = 'crosshair';

      const minLon = Math.min(start.lng, end.lng);
      const minLat = Math.min(start.lat, end.lat);
      const maxLon = Math.max(start.lng, end.lng);
      const maxLat = Math.max(start.lat, end.lat);

      if (Math.abs(maxLon - minLon) > 0.001 || Math.abs(maxLat - minLat) > 0.001) {
        const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`;
        onBboxDrawRef.current?.(bboxStr);

        // Update final rect
        const rectCoords: [number, number][] = [
          [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]
        ];
        if (m.getSource('draw-rect')) {
          (m.getSource('draw-rect') as mapboxgl.GeoJSONSource).setData({
            type: 'Feature', properties: {},
            geometry: { type: 'Polygon', coordinates: [rectCoords] }
          });
        }
      }
    });

    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load Parcel Scores ───────────────────────────────
  async function loadParcelScoresForMap(m: mapboxgl.Map, bbox?: string) {
    try {
      console.log('[MapView] loadParcelScoresForMap called, bbox:', bbox);
      const data = await fetchParcelScores(bbox ? { bbox } : undefined);
      if (!m.getContainer()?.parentNode) return;
      const featureCount = (data as any).features?.length ?? 0;
      console.log('[MapView] loaded', featureCount, 'features, source exists:', !!m.getSource('parcel-scores'));

      if (m.getSource('parcel-scores')) {
        (m.getSource('parcel-scores') as mapboxgl.GeoJSONSource).setData(data as unknown as GeoJSON.FeatureCollection);
      } else {
        m.addSource('parcel-scores', { type: 'geojson', data: data as unknown as GeoJSON.FeatureCollection });

        m.addLayer({
          id: 'parcel-scores-3d',
          type: 'fill-extrusion',
          source: 'parcel-scores',
          slot: SLOT_MIDDLE,
          paint: {
            'fill-extrusion-color': SCORE_COLOR_RAMP as any,
            'fill-extrusion-height': SCORE_HEIGHT_EXPR as any,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': PARCEL_3D_OPACITY,
            'fill-extrusion-emissive-strength': 0.5,
          }
        });

        m.addLayer({
          id: 'parcel-scores-flat',
          type: 'fill',
          source: 'parcel-scores',
          slot: SLOT_MIDDLE,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': SCORE_COLOR_RAMP as any,
            'fill-opacity': PARCEL_FLAT_OPACITY,
            'fill-outline-color': PARCEL_OUTLINE_COLOR,
          }
        });

        m.addLayer({
          id: 'parcel-outlines',
          type: 'line',
          source: 'parcel-scores',
          slot: SLOT_MIDDLE,
          paint: {
            'line-color': PARCEL_OUTLINE_COLOR,
            'line-width': PARCEL_OUTLINE_WIDTH,
            'line-opacity': PARCEL_OUTLINE_OPACITY,
          }
        });

        m.addLayer({
          id: 'parcel-hover',
          type: 'circle',
          source: 'parcel-scores',
          slot: SLOT_TOP,
          filter: ['==', ['get', 'parcel_id'], ''],
          paint: {
            'circle-radius': 25,
            'circle-color': 'rgba(255,255,255,0.15)',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.8,
          }
        });

        m.addLayer({
          id: 'parcel-highlight',
          type: 'circle',
          source: 'parcel-scores',
          slot: SLOT_TOP,
          filter: ['==', ['get', 'parcel_id'], ''],
          paint: {
            'circle-radius': 40,
            'circle-color': SCORE_COLOR_RAMP as any,
            'circle-opacity': 0.5,
            'circle-stroke-width': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 1,
          }
        });

        m.addLayer({
          id: 'parcel-score-labels',
          type: 'symbol',
          source: 'parcel-scores',
          slot: SLOT_TOP,
          minzoom: 16,
          layout: {
            'text-field': ['concat', ['to-string', ['round', ['get', 'score']]], '/100'],
            'text-size': 11,
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-anchor': 'center'
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5
          }
        });
      }
      // Store features for proximity-based click detection
      parcelFeaturesRef.current = (data as any).features || [];
      console.log('[MapView] stored', parcelFeaturesRef.current.length, 'features in ref');
    } catch (e) {
      console.warn('Failed to load parcel scores:', e);
    }
  }

  // ─── STYLE SWITCH ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    try {
      map.current.setConfigProperty('basemap', 'lightPreset', isLightMode ? 'day' : 'night');
    } catch (e) {
      console.warn('Could not set light preset', e);
    }
  }, [isLightMode, mapReady]);

  // ─── 3D/2D TOGGLE ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    map.current.easeTo({
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? -15 : 0,
      duration: 1000
    });
    try {
      if (map.current.getLayer('parcel-scores-3d')) {
        map.current.setLayoutProperty('parcel-scores-3d', 'visibility', is3DMode ? 'visible' : 'none');
      }
      if (map.current.getLayer('parcel-scores-flat')) {
        map.current.setLayoutProperty('parcel-scores-flat', 'visibility', is3DMode ? 'none' : 'visible');
      }
    } catch (e) { console.warn('Layer toggle error:', e); }
  }, [is3DMode, mapReady]);

  // ─── CLEAR SELECTION MARKER WHEN PANEL CLOSES ─────────
  useEffect(() => {
    if (!selectedParcelId && selectionMarkerRef.current) {
      selectionMarkerRef.current.remove();
      selectionMarkerRef.current = null;
    }
  }, [selectedParcelId]);

  // ─── LAYER VISIBILITY ─────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    try {
      try {
        map.current.setConfigProperty('basemap', 'show3dObjects', visibleLayers.buildings);
      } catch (e) {}

      const lVis = visibleLayers.ionLine ? 'visible' : 'none';
      if (map.current.getLayer('ion-line-glow')) map.current.setLayoutProperty('ion-line-glow', 'visibility', lVis);
      if (map.current.getLayer('ion-line-main')) map.current.setLayoutProperty('ion-line-main', 'visibility', lVis);
      const sVis = visibleLayers.ionStations ? 'visible' : 'none';
      if (map.current.getLayer('ion-station-points')) map.current.setLayoutProperty('ion-station-points', 'visibility', sVis);
      const pVis = visibleLayers.parcelScores ? 'visible' : 'none';
      if (map.current.getLayer('parcel-scores-3d') && is3DMode) map.current.setLayoutProperty('parcel-scores-3d', 'visibility', pVis);
      if (map.current.getLayer('parcel-scores-flat') && !is3DMode) map.current.setLayoutProperty('parcel-scores-flat', 'visibility', pVis);
      if (map.current.getLayer('parcel-outlines')) map.current.setLayoutProperty('parcel-outlines', 'visibility', pVis);
      if (map.current.getLayer('parcel-score-labels')) map.current.setLayoutProperty('parcel-score-labels', 'visibility', pVis);
    } catch (e) { console.warn('Layer visibility change failed', e); }
  }, [visibleLayers, mapReady, is3DMode]);

  // ─── RESET VIEW ───────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady || resetTrigger === 0) return;
    map.current.flyTo({ ...INITIAL_VIEW_STATE, duration: 1500, essential: true });
  }, [resetTrigger, mapReady]);

  // ─── ION SIMULATION OVERLAY ───────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    ['sim-ion-delta-3d', 'sim-ion-delta-flat'].forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id);
    });
    if (m.getSource('sim-ion-delta')) m.removeSource('sim-ion-delta');

    if (ionSimResult && ionSimResult.features?.length > 0) {
      m.addSource('sim-ion-delta', {
        type: 'geojson',
        data: ionSimResult as unknown as GeoJSON.FeatureCollection
      });

      m.addLayer({
        id: 'sim-ion-delta-3d',
        type: 'fill-extrusion',
        source: 'sim-ion-delta',
        slot: SLOT_MIDDLE,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'score_delta'],
            0, '#334155', 5, '#22C55E', 15, '#16A34A', 30, '#15803D'
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['get', 'score_delta'],
            0, 2, 10, 30, 30, 80
          ],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.7,
          'fill-extrusion-emissive-strength': 0.8
        }
      });
    }
  }, [ionSimResult, mapReady]);

  // ─── GEMINI SIMULATION OVERLAY ────────────────────────
  const clearSimulation = useCallback(() => {
    if (!map.current) return;
    ['sim-buildings', 'sim-buildings-glow', 'sim-radius-fill', 'sim-radius-line'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    ['sim-buildings-source', 'sim-radius-source'].forEach(id => {
      if (map.current?.getSource(id)) map.current.removeSource(id);
    });
  }, []);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    if (showSimulation && simulationResult) {
      const m = map.current;
      clearSimulation();

      m.addSource('sim-buildings-source', {
        type: 'geojson',
        data: simulationResult.affected_parcels
      });

      m.addLayer({
        id: 'sim-buildings',
        type: 'fill-extrusion',
        source: 'sim-buildings-source',
        slot: SLOT_MIDDLE,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'score'],
            0, '#9e9e9e',
            30, '#bdbdbd',
            31, '#fff176',
            60, '#fdd835',
            61, '#ffb74d',
            80, '#f57c00',
            81, '#ef5350',
            100, '#c62828',
          ],
          'fill-extrusion-height': ['get', 'proposed_height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.85,
          'fill-extrusion-emissive-strength': 0.6
        }
      });

      m.addLayer({
        id: 'sim-buildings-glow',
        type: 'line',
        source: 'sim-buildings-source',
        slot: SLOT_MIDDLE,
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.4, 'line-emissive-strength': 0.8 }
      });

      // Fly camera to affected area using bbox of all features
      if (simulationResult.affected_parcels.features.length > 0) {
        try {
          const bbox = turf.bbox(simulationResult.affected_parcels);
          m.fitBounds(
            [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
            { padding: 80, pitch: is3DMode ? 55 : 0, bearing: is3DMode ? -15 : 0, duration: 2000 }
          );
        } catch (e) {
          // Fallback to zoneCenter
          if (simulationResult.zoneCenter) {
            m.flyTo({
              center: [simulationResult.zoneCenter.lng, simulationResult.zoneCenter.lat],
              zoom: 16,
              pitch: is3DMode ? 60 : 0,
              bearing: is3DMode ? -20 : 0,
              duration: 2000,
              essential: true
            });
          }
        }
      } else if (simulationResult.zoneCenter) {
        m.flyTo({
          center: [simulationResult.zoneCenter.lng, simulationResult.zoneCenter.lat],
          zoom: 16,
          pitch: is3DMode ? 60 : 0,
          bearing: is3DMode ? -20 : 0,
          duration: 2000,
          essential: true
        });
      }
    } else {
      clearSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSimulation, simulationResult, mapReady]);

  // ─── DRAW AREA CURSOR ────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    if (drawAreaMode) {
      map.current.getCanvas().style.cursor = 'crosshair';
      map.current.dragPan.disable();
    } else {
      map.current.getCanvas().style.cursor = '';
      map.current.dragPan.enable();
      drawStartRef.current = null;
      if (map.current.getLayer('draw-rect-fill')) map.current.removeLayer('draw-rect-fill');
      if (map.current.getLayer('draw-rect-line')) map.current.removeLayer('draw-rect-line');
      if (map.current.getSource('draw-rect')) map.current.removeSource('draw-rect');
    }
  }, [drawAreaMode, mapReady]);

  // ─── ION SIMULATION STATION MARKER ──────────────────
  useEffect(() => {
    // Remove old marker
    if (ionMarkerRef.current) {
      ionMarkerRef.current.remove();
      ionMarkerRef.current = null;
    }
    if (!map.current || !mapReady || !ionSimClickedLocation) return;

    // Create a pulsing cyan marker
    const el = document.createElement('div');
    el.innerHTML = `
      <div style="position:relative;width:32px;height:32px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(6,182,212,0.25);animation:ion-pulse 1.5s ease-out infinite;"></div>
        <div style="position:absolute;inset:6px;border-radius:50%;background:#06B6D4;border:2px solid #fff;box-shadow:0 0 12px rgba(6,182,212,0.6);"></div>
        <svg style="position:absolute;top:7px;left:7px;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18"/><path d="M4 9h16"/><path d="M4 15h16"/>
        </svg>
      </div>
    `;
    // Add pulse keyframes if not already present
    if (!document.getElementById('ion-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'ion-pulse-style';
      style.textContent = `@keyframes ion-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }`;
      document.head.appendChild(style);
    }

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([ionSimClickedLocation.lng, ionSimClickedLocation.lat])
      .addTo(map.current);
    ionMarkerRef.current = marker;
  }, [ionSimClickedLocation, mapReady]);

  return <div ref={mapContainer} className="absolute inset-0 w-full h-full bg-[#0A1628]" />;
}
