import { useState, useEffect } from 'react';
import MapView from '../components/MapView';
import CityBadge from '../components/CityBadge';
import LayerControls from '../components/LayerControls';
import QueryBar from '../components/QueryBar';
import ResultsPanel from '../components/ResultsPanel';
import SettingsModal from '../components/SettingsModal';
import { simulateZoningChange } from '../services/geminiService';
import type { SimulationResult } from '../services/geminiService';
import { speakNarration } from '../services/elevenLabsService';

export default function MapDashboard() {
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [showQueryBar, setShowQueryBar] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Map Controls State
  const [is3DMode, setIs3DMode] = useState(true);
  const [isLightMode, setIsLightMode] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({
    buildings: true,
    ionLine: true,
    ionStations: true
  });
  
  const [resetTrigger, setResetTrigger] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowQueryBar(true);
    }, 2500); 
    return () => clearTimeout(timer);
  }, []);

  const handleQuerySubmit = async (query: string) => {
    setCurrentQuery(query);
    setIsResultsOpen(true);
    setLoading(true);
    
    // Call Gemini Service
    const aiResult = await simulateZoningChange(query);
    setResult(aiResult);
    setLoading(false);
    
    // Play narration
    setIsSpeaking(true);
    await speakNarration(aiResult.narrative);
    setIsSpeaking(false);
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden ${isLightMode ? 'bg-[#F8FAFC]' : 'bg-[#0A1628]'} opacity-0 animate-[fade-in_0.8s_ease-out_forwards]`}>
      <MapView 
        showSimulation={!!result && isResultsOpen} 
        simulationResult={result}
        is3DMode={is3DMode}
        isLightMode={isLightMode}
        visibleLayers={visibleLayers}
        resetTrigger={resetTrigger}
      />
      
      <CityBadge />
      
      <LayerControls 
        is3DMode={is3DMode}
        onToggle3D={() => setIs3DMode(!is3DMode)}
        isLightMode={isLightMode}
        onToggleLight={() => setIsLightMode(!isLightMode)}
        visibleLayers={visibleLayers}
        onToggleLayer={(layer: 'buildings' | 'ionLine' | 'ionStations') => 
          setVisibleLayers(prev => ({...prev, [layer]: !prev[layer]}))
        }
        onReset={() => setResetTrigger(prev => prev + 1)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      
      {showQueryBar && (
        <QueryBar onQuerySubmit={handleQuerySubmit} />
      )}
      
      <ResultsPanel 
        isOpen={isResultsOpen} 
        onClose={() => setIsResultsOpen(false)} 
        query={currentQuery}
        loading={loading}
        result={result}
        isSpeaking={isSpeaking}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}
