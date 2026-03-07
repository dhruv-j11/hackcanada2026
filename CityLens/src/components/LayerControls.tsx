import { useState } from 'react';
import { Layers, Box, Sun, Maximize, Glasses, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LayerControlsProps {
  is3DMode: boolean;
  onToggle3D: () => void;
  isLightMode: boolean;
  onToggleLight: () => void;
  visibleLayers: {
    buildings: boolean;
    ionLine: boolean;
    ionStations: boolean;
  };
  onToggleLayer: (layer: 'buildings' | 'ionLine' | 'ionStations') => void;
  onReset: () => void;
  onOpenSettings: () => void;
}

export default function LayerControls({ 
  is3DMode, onToggle3D, isLightMode, onToggleLight, visibleLayers, onToggleLayer, onReset, onOpenSettings
}: LayerControlsProps) {
  const [layersOpen, setLayersOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
      {/* VR Mode Button */}
      <button 
        onClick={() => navigate('/city/waterloo/vr')}
        className="mb-2 w-max px-3 h-9 rounded-lg flex items-center justify-center gap-2 transition-all bg-[#0F2035] border border-[#1E3050] text-[#06B6D4] hover:bg-[#1E3050] hover:text-white hover:border-[#06B6D4] shadow-md"
      >
        <Glasses className="w-4 h-4" />
        <span className="text-[13px] font-medium tracking-wide">ENTER VR</span>
      </button>

      {/* Layers Panel Toggle */}
      <div className="relative flex flex-col items-end">
        <button 
          onClick={() => setLayersOpen(!layersOpen)}
          className={`mb-2 w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-[#111D32] 
            ${layersOpen 
              ? 'border-l-[3px] border-l-[#3B82F6] border-y border-r border-[#1E3050] text-[#3B82F6]' 
              : 'border border-[#1E3050] text-[#94A3B8]'
            } hover:bg-[#1E3050] hover:border-[#3B82F6] hover:text-white shadow-md`}
        >
          <Layers className="w-5 h-5" />
        </button>
        
        {layersOpen && (
          <div className="absolute top-0 right-12 w-48 bg-[#111D32] border border-[#1E3050] rounded-xl p-3 shadow-xl flex flex-col gap-3">
            <h4 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider">Map Layers</h4>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={visibleLayers.buildings} onChange={() => onToggleLayer('buildings')} className="accent-[#3B82F6] cursor-pointer" />
              <span className="text-[13px] text-[#94A3B8] group-hover:text-white transition-colors">3D Buildings</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={visibleLayers.ionLine} onChange={() => onToggleLayer('ionLine')} className="accent-[#3B82F6] cursor-pointer" />
              <span className="text-[13px] text-[#94A3B8] group-hover:text-white transition-colors">ION LRT Line</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={visibleLayers.ionStations} onChange={() => onToggleLayer('ionStations')} className="accent-[#3B82F6] cursor-pointer" />
              <span className="text-[13px] text-[#94A3B8] group-hover:text-white transition-colors">ION Stations</span>
            </label>
          </div>
        )}
      </div>

      <button 
        onClick={onToggle3D}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-[#111D32] 
          ${is3DMode 
            ? 'border-l-[3px] border-l-[#3B82F6] border-y border-r border-[#1E3050] text-[#3B82F6]' 
            : 'border border-[#1E3050] text-[#94A3B8]'
          } hover:bg-[#1E3050] hover:border-[#3B82F6] hover:text-white shadow-md`}
      >
        <Box className="w-5 h-5" />
      </button>

      <button 
        onClick={onToggleLight}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-[#111D32] 
          ${isLightMode 
            ? 'border-l-[3px] border-l-[#3B82F6] border-y border-r border-[#1E3050] text-[#3B82F6]' 
            : 'border border-[#1E3050] text-[#94A3B8]'
          } hover:bg-[#1E3050] hover:border-[#3B82F6] hover:text-white shadow-md`}
      >
        <Sun className="w-5 h-5" />
      </button>

      <button 
        onClick={onReset}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-[#111D32] border border-[#1E3050] text-[#94A3B8] hover:bg-[#1E3050] hover:border-[#3B82F6] hover:text-white shadow-md"
        title="Reset View"
      >
        <Maximize className="w-5 h-5" />
      </button>

      <div className="w-9 my-0.5 border-t border-[#1E3050]"></div>

      <button 
        onClick={onOpenSettings}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-[#111D32] border border-[#1E3050] text-[#94A3B8] hover:bg-[#1E3050] hover:border-[#3B82F6] hover:text-white shadow-md group relative"
        title="API Settings"
      >
        <span className="absolute right-12 w-max px-2 py-1 bg-black text-white text-[11px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">API Setup</span>
        <Settings className="w-5 h-5" />
      </button>
    </div>
  );
}
