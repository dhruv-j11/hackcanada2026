import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, INITIAL_VIEW_STATE, TARGET_VIEW_STATE } from '../utils/mapConfig';
import { ionLineGeoJSON, ionStationsGeoJSON } from '../data/ionRoute';
import { fetchParcelScores } from '../services/apiService';
import type { IonSimulationResult } from '../services/apiService';
import type { SimulationResult } from '../services/geminiService';
import circle from '@turf/circle';

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
  drawAreaMode?: boolean;
  onBboxDraw?: (bbox: string) => void;
  showSimulation?: boolean;
  simulationResult?: SimulationResult | null;
}

const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';

// Score → color interpolation from mapbox_config.json
const SCORE_COLOR_RAMP: unknown[] = [
  'interpolate', ['linear'], ['get', 'score'],
  0, '#9e9e9e', 30, '#bdbdbd',
  31, '#fff176', 60, '#fdd835',
  61, '#ffb74d', 80, '#f57c00',
  81, '#ef5350', 100, '#c62828'
];

export default function MapView({
  is3DMode, isLightMode, visibleLayers, resetTrigger,
  onParcelClick, onMapClick, ionSimResult, ionSimMode, drawAreaMode, onBboxDraw,
  showSimulation, simulationResult
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const drawStartRef = useRef<mapboxgl.LngLat | null>(null);


  // Refs for values used in callbacks
  const isLightModeRef = useRef(isLightMode);
  const is3DModeRef = useRef(is3DMode);
  const ionSimModeRef = useRef(ionSimMode);
  const drawAreaModeRef = useRef(drawAreaMode);

  useEffect(() => { isLightModeRef.current = isLightMode; }, [isLightMode]);
  useEffect(() => { is3DModeRef.current = is3DMode; }, [is3DMode]);
  useEffect(() => { ionSimModeRef.current = ionSimMode; }, [ionSimMode]);
  useEffect(() => { drawAreaModeRef.current = drawAreaMode; }, [drawAreaMode]);

  // ─── Load Parcel Scores ─────────────────────────────────────
  const loadParcelScores = useCallback(async (m: mapboxgl.Map, bbox?: string) => {
    try {
      const data = await fetchParcelScores(bbox ? { bbox } : undefined);
      if (m.getSource('parcel-scores')) {
        (m.getSource('parcel-scores') as mapboxgl.GeoJSONSource).setData(data as unknown as GeoJSON.FeatureCollection);
      } else {
        m.addSource('parcel-scores', { type: 'geojson', data: data as unknown as GeoJSON.FeatureCollection });

        // 3D fill-extrusion layer
        m.addLayer({
          id: 'parcel-scores-3d',
          type: 'fill-extrusion',
          source: 'parcel-scores',
          paint: {
            'fill-extrusion-color': SCORE_COLOR_RAMP as any,
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['get', 'score'],
              0, 5, 50, 25, 100, 80
            ],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85
          }
        });

        // 2D flat layer (hidden by default)
        m.addLayer({
          id: 'parcel-scores-flat',
          type: 'fill',
          source: 'parcel-scores',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': SCORE_COLOR_RAMP as any,
            'fill-opacity': 0.7,
            'fill-outline-color': '#333333'
          }
        });

        // Outlines
        m.addLayer({
          id: 'parcel-outlines',
          type: 'line',
          source: 'parcel-scores',
          paint: { 'line-color': '#333333', 'line-width': 0.5, 'line-opacity': 0.4 }
        });

        // Score labels at high zoom
        m.addLayer({
          id: 'parcel-score-labels',
          type: 'symbol',
          source: 'parcel-scores',
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
    } catch (e) {
      console.warn('Failed to load parcel scores:', e);
    }
  }, []);

  // ─── Add All Custom Layers ──────────────────────────────
  const addAllCustomLayers = useCallback((m: mapboxgl.Map) => {
    const layers = m.getStyle().layers;
    let labelLayerId: string | undefined;
    for (const layer of layers) {
      if (layer.type === 'symbol' && layer.layout && (layer.layout as any)['text-field']) {
        labelLayerId = layer.id;
        break;
      }
    }

    const light = isLightModeRef.current;

    // 3D Mapbox buildings
    if (!m.getLayer('add-3d-buildings')) {
      m.addLayer({
        id: 'add-3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 12,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'height'],
            0, light ? '#e2e8f0' : '#0f1d32',
            50, light ? '#cbd5e1' : '#1a2d4a',
            100, light ? '#94a3b8' : '#243b5c',
            200, light ? '#64748b' : '#2e4a6e'
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            12, 0, 12.5, ['get', 'height']
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            12, 0, 12.5, ['get', 'min_height']
          ],
          'fill-extrusion-opacity': 0.85
        }
      }, labelLayerId);
    }

    // ION LRT line
    if (!m.getSource('ion-route')) {
      m.addSource('ion-route', { type: 'geojson', data: ionLineGeoJSON });
      m.addLayer({
        id: 'ion-line-glow', type: 'line', source: 'ion-route',
        paint: { 'line-color': '#06B6D4', 'line-width': 8, 'line-opacity': 0.3 }
      });
      m.addLayer({
        id: 'ion-line-main', type: 'line', source: 'ion-route',
        paint: { 'line-color': '#06B6D4', 'line-width': 4 }
      });
    }

    // ION Stations
    if (!m.getSource('ion-stations')) {
      m.addSource('ion-stations', { type: 'geojson', data: ionStationsGeoJSON });
      m.addLayer({
        id: 'ion-station-points', type: 'circle', source: 'ion-stations',
        paint: {
          'circle-radius': 6, 'circle-color': '#06B6D4',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': light ? '#000000' : '#FFFFFF'
        }
      });
    }

    // Load parcel scores
    loadParcelScores(m);
  }, [loadParcelScores]);

  // ─── INIT ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapContainer.current.innerHTML = '';

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: isLightModeRef.current ? LIGHT_STYLE : DARK_STYLE,
      ...INITIAL_VIEW_STATE,
      antialias: true
    });

    map.current = m;

    m.on('style.load', () => {
      addAllCustomLayers(m);
      setMapReady(true);
    });

    m.on('load', () => {
      m.flyTo({ ...TARGET_VIEW_STATE, duration: 2000, essential: true });
    });

    // Parcel click handler
    m.on('click', 'parcel-scores-3d', (e) => {
      if (ionSimModeRef.current || drawAreaModeRef.current) return;
      const feature = e.features?.[0];
      if (feature?.properties?.parcel_id) {
        onParcelClick?.(feature.properties.parcel_id);
        e.originalEvent.stopPropagation();
      }
    });
    m.on('click', 'parcel-scores-flat', (e) => {
      if (ionSimModeRef.current || drawAreaModeRef.current) return;
      const feature = e.features?.[0];
      if (feature?.properties?.parcel_id) {
        onParcelClick?.(feature.properties.parcel_id);
        e.originalEvent.stopPropagation();
      }
    });

    // General click (for ION sim mode)
    m.on('click', (e) => {
      if (ionSimModeRef.current) {
        onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      }
    });

    // Cursor changes
    m.on('mouseenter', 'parcel-scores-3d', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'parcel-scores-3d', () => { m.getCanvas().style.cursor = ''; });
    m.on('mouseenter', 'parcel-scores-flat', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'parcel-scores-flat', () => { m.getCanvas().style.cursor = ''; });

    // Reload scores on moveend
    m.on('moveend', () => {
      const bounds = m.getBounds();
      if (!bounds) return;
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      loadParcelScores(m, bbox);
    });

    // Bbox draw via mousedown+drag with Shift
    m.on('mousedown', (e) => {
      if (!drawAreaModeRef.current) return;
      drawStartRef.current = e.lngLat;
      m.getCanvas().style.cursor = 'crosshair';
    });
    m.on('mouseup', (e) => {
      if (!drawAreaModeRef.current || !drawStartRef.current) return;
      const start = drawStartRef.current;
      const end = e.lngLat;
      drawStartRef.current = null;
      m.getCanvas().style.cursor = '';

      const minLon = Math.min(start.lng, end.lng);
      const minLat = Math.min(start.lat, end.lat);
      const maxLon = Math.max(start.lng, end.lng);
      const maxLat = Math.max(start.lat, end.lat);

      // Only trigger if drag was meaningful (not just a click)
      if (Math.abs(maxLon - minLon) > 0.001 || Math.abs(maxLat - minLat) > 0.001) {
        const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`;
        onBboxDraw?.(bboxStr);

        // Draw rectangle overlay
        const rectCoords: [number, number][] = [
          [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]
        ];
        if (m.getSource('draw-rect')) {
          (m.getSource('draw-rect') as mapboxgl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [rectCoords] }
          });
        } else {
          m.addSource('draw-rect', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [rectCoords] }
            }
          });
          m.addLayer({
            id: 'draw-rect-fill', type: 'fill', source: 'draw-rect',
            paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.1 }
          });
          m.addLayer({
            id: 'draw-rect-line', type: 'line', source: 'draw-rect',
            paint: { 'line-color': '#3B82F6', 'line-width': 2, 'line-dasharray': [3, 3] }
          });
        }
      }
    });

    return () => { m.remove(); map.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── STYLE SWITCH ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    map.current.setStyle(isLightMode ? LIGHT_STYLE : DARK_STYLE);
  }, [isLightMode, mapReady]);

  // ─── 3D/2D TOGGLE ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    map.current.easeTo({
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? -15 : 0,
      duration: 1000
    });
    // Toggle parcel layer visibility based on 3D mode
    try {
      if (map.current.getLayer('parcel-scores-3d')) {
        map.current.setLayoutProperty('parcel-scores-3d', 'visibility', is3DMode ? 'visible' : 'none');
      }
      if (map.current.getLayer('parcel-scores-flat')) {
        map.current.setLayoutProperty('parcel-scores-flat', 'visibility', is3DMode ? 'none' : 'visible');
      }
    } catch (e) { console.warn('Layer toggle error:', e); }
  }, [is3DMode, mapReady]);

  // ─── LAYER VISIBILITY ─────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    try {
      const bVis = visibleLayers.buildings ? 'visible' : 'none';
      if (map.current.getLayer('add-3d-buildings')) map.current.setLayoutProperty('add-3d-buildings', 'visibility', bVis);
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
    map.current.flyTo({ ...TARGET_VIEW_STATE, duration: 1500, essential: true });
  }, [resetTrigger, mapReady]);

  // ─── ION SIMULATION OVERLAY ───────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    // Clear previous sim
    ['sim-ion-delta-3d', 'sim-ion-delta-flat'].forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id);
    });
    if (m.getSource('sim-ion-delta')) m.removeSource('sim-ion-delta');

    if (ionSimResult && ionSimResult.features?.length > 0) {
      m.addSource('sim-ion-delta', {
        type: 'geojson',
        data: ionSimResult as unknown as GeoJSON.FeatureCollection
      });

      // Delta heatmap: green = improved, size by delta
      m.addLayer({
        id: 'sim-ion-delta-3d',
        type: 'fill-extrusion',
        source: 'sim-ion-delta',
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'score_delta'],
            0, '#334155',
            5, '#22C55E',
            15, '#16A34A',
            30, '#15803D'
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['get', 'score_delta'],
            0, 2, 10, 30, 30, 80
          ],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.7
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

      const features = simulationResult.buildingFootprints.map((b, i) => ({
        type: 'Feature' as const,
        properties: { height: b.height, base_height: 0, building_type: b.type, index: i },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...b.coordinates, b.coordinates[0]]]
        }
      }));

      m.addSource('sim-buildings-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection' as const, features }
      });

      m.addLayer({
        id: 'sim-buildings',
        type: 'fill-extrusion',
        source: 'sim-buildings-source',
        paint: {
          'fill-extrusion-color': [
            'match', ['get', 'building_type'],
            'residential', '#3B82F6',
            'mixed-use', '#06B6D4',
            'commercial', '#8B5CF6',
            '#3B82F6'
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base_height'],
          'fill-extrusion-opacity': 0.8,
          'fill-extrusion-vertical-gradient': true
        }
      });

      m.addLayer({
        id: 'sim-buildings-glow',
        type: 'line',
        source: 'sim-buildings-source',
        paint: { 'line-color': '#60A5FA', 'line-width': 1.5, 'line-opacity': 0.5 }
      });

      if (simulationResult.zoneCenter) {
        const center: [number, number] = [simulationResult.zoneCenter.lng, simulationResult.zoneCenter.lat];
        const radiusFeature = circle(center, 0.4, { steps: 64, units: 'kilometers' });
        m.addSource('sim-radius-source', { type: 'geojson', data: radiusFeature });
        m.addLayer({
          id: 'sim-radius-fill', source: 'sim-radius-source', type: 'fill',
          paint: { 'fill-color': '#06B6D4', 'fill-opacity': 0.08 }
        });
        m.addLayer({
          id: 'sim-radius-line', source: 'sim-radius-source', type: 'line',
          paint: { 'line-color': '#06B6D4', 'line-width': 2, 'line-dasharray': [3, 3], 'line-opacity': 0.4 }
        });

        m.flyTo({
          center,
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
      // Clear draw rect
      if (map.current.getLayer('draw-rect-fill')) map.current.removeLayer('draw-rect-fill');
      if (map.current.getLayer('draw-rect-line')) map.current.removeLayer('draw-rect-line');
      if (map.current.getSource('draw-rect')) map.current.removeSource('draw-rect');
    }
  }, [drawAreaMode, mapReady]);

  return <div ref={mapContainer} className="absolute inset-0 w-full h-full bg-[#0A1628]" />;
}
