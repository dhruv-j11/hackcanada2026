import { useState, useEffect, useCallback, useRef } from 'react';
import MapView from '../components/MapView';
import CityBadge from '../components/CityBadge';
import LayerControls from '../components/LayerControls';
import QueryBar from '../components/QueryBar';
import ResultsPanel from '../components/ResultsPanel';
import SettingsModal from '../components/SettingsModal';
import ParcelDetailPanel from '../components/ParcelDetailPanel';
import AreaAnalysisPanel from '../components/AreaAnalysisPanel';
import CategorySelector from '../components/CategorySelector';
import IonStationSimulator from '../components/IonStationSimulator';
import ScoreLegend from '../components/ScoreLegend';
import { simulateZoningChange } from '../services/geminiService';
import type { SimulationResult } from '../services/geminiService';
import { speakNarration } from '../services/elevenLabsService';
import type { IonSimulationResult } from '../services/apiService';
import { rescoreByCategory } from '../services/apiService';

export default function MapDashboard() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Map Controls State
  const [is3DMode, setIs3DMode] = useState(true);
  const [isLightMode, setIsLightMode] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({
    buildings: true,
    ionLine: true,
    ionStations: true,
    parcelScores: true,
  });
  const [resetTrigger, setResetTrigger] = useState(0);

  // Old simulation flow state (QueryBar + ResultsPanel)
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [showQueryBar, setShowQueryBar] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Panel state
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [drawnBbox, setDrawnBbox] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>('residential');

  // ION sim state
  const [ionSimMode, setIonSimMode] = useState(false);
  const [ionSimClickedLocation, setIonSimClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [ionSimResult, setIonSimResult] = useState<IonSimulationResult | null>(null);

  // Draw area state
  const [drawAreaMode, setDrawAreaMode] = useState(false);

  // Refresh key to force MapView to re-fetch scores after category change
  const [refreshKey, setRefreshKey] = useState(0);
  const hasInitialRescore = useRef(false);

  // Initial rescore with residential weights on mount
  useEffect(() => {
    if (hasInitialRescore.current) return;
    hasInitialRescore.current = true;
    rescoreByCategory('residential')
      .then(() => setRefreshKey(prev => prev + 1))
      .catch(e => console.error('Initial residential rescore failed:', e));
  }, []);

  // Show query bar delayed
  useEffect(() => {
    const timer = setTimeout(() => setShowQueryBar(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Simulation query handler (QueryBar → Gemini → ResultsPanel)
  const handleQuerySubmit = async (query: string) => {
    setCurrentQuery(query);
    setIsResultsOpen(true);
    setSimLoading(true);
    // Close other panels
    setSelectedParcelId(null);
    setDrawnBbox(null);

    const aiResult = await simulateZoningChange(query);
    setSimResult(aiResult);
    setSimLoading(false);

    setIsSpeaking(true);
    await speakNarration(aiResult.narrative);
    setIsSpeaking(false);
  };

  const handleParcelClick = useCallback((parcelId: string) => {
    setSelectedParcelId(parcelId);
    setDrawnBbox(null);
    setIsResultsOpen(false);
  }, []);

  const handleBboxDraw = useCallback((bbox: string) => {
    setDrawnBbox(bbox);
    setSelectedParcelId(null);
    setIsResultsOpen(false);
    setDrawAreaMode(false);
  }, []);

  const handleMapClick = useCallback((lngLat: { lng: number; lat: number }) => {
    if (ionSimMode) {
      setIonSimClickedLocation(lngLat);
    }
  }, [ionSimMode]);

  const handleCategoryChange = useCallback((cat: string | null) => {
    setActiveCategory(cat);
  }, []);

  const handleRefreshScores = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleIonSimResult = useCallback((result: IonSimulationResult | null) => {
    setIonSimResult(result);
    if (!result) {
      setIonSimClickedLocation(null);
    }
  }, []);

  const handleIonSimClose = useCallback(() => {
    setIonSimMode(false);
    setIonSimClickedLocation(null);
    setIonSimResult(null);
  }, []);

  return (
    <div className={`relative w-screen h-screen overflow-hidden ${isLightMode ? 'bg-[#F8FAFC]' : 'bg-[#050A1A]'} opacity-0 animate-[fade-in_0.8s_ease-out_forwards]`} style={{ fontFamily: 'Rubik' }}>
      <MapView
        key={refreshKey}
        is3DMode={is3DMode}
        isLightMode={isLightMode}
        visibleLayers={visibleLayers}
        resetTrigger={resetTrigger}
        onParcelClick={handleParcelClick}
        onMapClick={handleMapClick}
        ionSimResult={ionSimResult}
        ionSimMode={ionSimMode}
        ionSimClickedLocation={ionSimClickedLocation}
        drawAreaMode={drawAreaMode}
        onBboxDraw={handleBboxDraw}
        showSimulation={!!simResult && isResultsOpen}
        simulationResult={simResult}
        selectedParcelId={selectedParcelId}
      />

      <CityBadge />

      {/* Category selector at top */}
      {showQueryBar && (
        <CategorySelector
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
          onRefreshScores={handleRefreshScores}
        />
      )}

      <LayerControls
        is3DMode={is3DMode}
        onToggle3D={() => setIs3DMode(!is3DMode)}
        isLightMode={isLightMode}
        onToggleLight={() => setIsLightMode(!isLightMode)}
        visibleLayers={visibleLayers}
        onToggleLayer={(layer) =>
          setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }))
        }
        onReset={() => setResetTrigger(prev => prev + 1)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        ionSimMode={ionSimMode}
        onToggleIonSim={() => {
          setIonSimMode(!ionSimMode);
          if (ionSimMode) handleIonSimClose();
        }}
        drawAreaMode={drawAreaMode}
        onToggleDrawArea={() => {
          setDrawAreaMode(!drawAreaMode);
          if (!drawAreaMode) setDrawnBbox(null);
        }}
      />

      {/* Score Legend */}
      {visibleLayers.parcelScores && !drawAreaMode && !ionSimMode && <ScoreLegend />}

      {/* QueryBar — restored */}
      {showQueryBar && !drawAreaMode && !ionSimMode && (
        <QueryBar onQuerySubmit={handleQuerySubmit} />
      )}

      {/* Simulation ResultsPanel — restored */}
      <ResultsPanel
        isOpen={isResultsOpen}
        onClose={() => setIsResultsOpen(false)}
        query={currentQuery}
        loading={simLoading}
        result={simResult}
        isSpeaking={isSpeaking}
      />

      {/* ION Station Simulator */}
      <IonStationSimulator
        isActive={ionSimMode}
        clickedLocation={ionSimClickedLocation}
        onClose={handleIonSimClose}
        onSimulationResult={handleIonSimResult}
      />

      {/* Parcel Detail Sidebar */}
      <ParcelDetailPanel
        parcelId={selectedParcelId}
        onClose={() => setSelectedParcelId(null)}
      />

      {/* Area Analysis Sidebar */}
      <AreaAnalysisPanel
        bbox={drawnBbox}
        onClose={() => { setDrawnBbox(null); setDrawAreaMode(false); }}
        onParcelClick={handleParcelClick}
      />



      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Draw area mode indicator */}
      {drawAreaMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-[#3B82F6]/90 backdrop-blur-md text-white px-4 py-2 rounded-full text-[13px] font-medium shadow-lg animate-fade-in">
          Click & drag to select an area for analysis
        </div>
      )}

      {/* ION sim mode indicator */}
      {ionSimMode && !ionSimClickedLocation && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-[#06B6D4]/90 backdrop-blur-md text-white px-4 py-2 rounded-full text-[13px] font-medium shadow-lg animate-fade-in">
          Click on the map to place a hypothetical ION station
        </div>
      )}
    </div>
  );
}
