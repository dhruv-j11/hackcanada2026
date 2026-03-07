import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, INITIAL_VIEW_STATE, TARGET_VIEW_STATE } from '../utils/mapConfig';
import { ionLineGeoJSON, ionStationsGeoJSON } from '../data/ionRoute';
import type { SimulationResult } from '../services/geminiService';
import circle from '@turf/circle';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface MapViewProps {
  showSimulation: boolean;
  simulationResult: SimulationResult | null;
  is3DMode: boolean;
  isLightMode: boolean;
  visibleLayers: {
    buildings: boolean;
    ionLine: boolean;
    ionStations: boolean;
  };
  resetTrigger: number;
}

const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';

export default function MapView({ 
  showSimulation, 
  simulationResult, 
  is3DMode, 
  isLightMode, 
  visibleLayers,
  resetTrigger 
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Use refs for values needed inside Mapbox callbacks to avoid stale closures
  const isLightModeRef = useRef(isLightMode);
  const is3DModeRef = useRef(is3DMode);
  const showSimulationRef = useRef(showSimulation);
  const simulationResultRef = useRef(simulationResult);
  
  useEffect(() => { isLightModeRef.current = isLightMode; }, [isLightMode]);
  useEffect(() => { is3DModeRef.current = is3DMode; }, [is3DMode]);
  useEffect(() => { showSimulationRef.current = showSimulation; }, [showSimulation]);
  useEffect(() => { simulationResultRef.current = simulationResult; }, [simulationResult]);

  const addAllCustomLayers = useCallback(() => {
    const m = map.current;
    if (!m) return;

    // Find label layer to insert buildings beneath for readability
    const layers = m.getStyle().layers;
    let labelLayerId: string | undefined;
    for (const layer of layers) {
      if (layer.type === 'symbol' && layer.layout && (layer.layout as any)['text-field']) {
        labelLayerId = layer.id;
        break;
      }
    }

    const light = isLightModeRef.current;

    // 3D Buildings from Mapbox composite source
    if (!m.getLayer('add-3d-buildings')) {
      m.addLayer(
        {
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
              12, 0,
              12.5, ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              12, 0,
              12.5, ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.85
          }
        },
        labelLayerId
      );
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

    // Re-add simulation if it was active
    if (showSimulationRef.current && simulationResultRef.current) {
      addSimBuildings(m, simulationResultRef.current);
    }
  }, []);

  // ---- INIT ----
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

    // style.load fires on initial load AND every setStyle call
    m.on('style.load', () => {
      addAllCustomLayers();
      setMapReady(true);
    });

    m.on('load', () => {
      m.flyTo({ ...TARGET_VIEW_STATE, duration: 2000, essential: true });
    });

    return () => { m.remove(); map.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- STYLE SWITCH ----
  useEffect(() => {
    if (!map.current || !mapReady) return;
    map.current.setStyle(isLightMode ? LIGHT_STYLE : DARK_STYLE);
    // style.load will fire and readd all layers via addAllCustomLayers
  }, [isLightMode, mapReady]);

  // ---- 3D PITCH ----
  useEffect(() => {
    if (!map.current || !mapReady) return;
    map.current.easeTo({
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? -15 : 0,
      duration: 1000
    });
  }, [is3DMode, mapReady]);

  // ---- LAYER VISIBILITY ----
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
    } catch(e) { console.warn("Layer visibility change failed", e); }
  }, [visibleLayers, mapReady]);

  // ---- RESET VIEW ----
  useEffect(() => {
    if (!map.current || !mapReady || resetTrigger === 0) return;
    map.current.flyTo({ ...TARGET_VIEW_STATE, duration: 1500, essential: true });
  }, [resetTrigger, mapReady]);

  // ---- SIMULATION LAYERS ----
  const clearSimulation = useCallback(() => {
    if (!map.current) return;
    ['sim-buildings', 'sim-buildings-glow', 'sim-radius-fill', 'sim-radius-line'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    ['sim-buildings-source', 'sim-radius-source'].forEach(id => {
      if (map.current?.getSource(id)) map.current.removeSource(id);
    });
  }, []);

  function addSimBuildings(m: mapboxgl.Map, result: SimulationResult) {
    // Clear any previous sim layers first
    ['sim-buildings', 'sim-buildings-glow', 'sim-radius-fill', 'sim-radius-line'].forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id);
    });
    ['sim-buildings-source', 'sim-radius-source'].forEach(id => {
      if (m.getSource(id)) m.removeSource(id);
    });

    const features = result.buildingFootprints.map((b, i) => ({
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

    // Radius circle
    if (result.zoneCenter) {
      const center: [number, number] = [result.zoneCenter.lng, result.zoneCenter.lat];
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
        pitch: is3DModeRef.current ? 60 : 0,
        bearing: is3DModeRef.current ? -20 : 0,
        duration: 2000,
        essential: true
      });
    }
  }

  useEffect(() => {
    if (!mapReady || !map.current) return;
    if (showSimulation && simulationResult) {
      addSimBuildings(map.current, simulationResult);
    } else {
      clearSimulation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSimulation, simulationResult, mapReady]);

  return <div ref={mapContainer} className="absolute inset-0 w-full h-full bg-[#0A1628]" />;
}
