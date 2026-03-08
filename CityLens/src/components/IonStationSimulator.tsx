import { useState } from 'react';
import { X, Train, Loader2, TrendingUp, ArrowUpRight } from 'lucide-react';
import { simulateIonStation } from '../services/apiService';
import type { IonSimulationResult } from '../services/apiService';

interface IonStationSimulatorProps {
  isActive: boolean;
  clickedLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onSimulationResult: (result: IonSimulationResult | null) => void;
}

export default function IonStationSimulator({ isActive, clickedLocation, onClose, onSimulationResult }: IonStationSimulatorProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IonSimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await simulateIonStation(lat, lng);
      setResult(res);
      onSimulationResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
      onSimulationResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger on new click
  if (clickedLocation && !loading && !result) {
    runSimulation(clickedLocation.lat, clickedLocation.lng);
  }

  const handleClose = () => {
    setResult(null);
    setError(null);
    onSimulationResult(null);
    onClose();
  };

  if (!isActive) return null;

  return (
    <div className="absolute bottom-24 left-4 z-20 w-[340px]" style={{ fontFamily: 'Rubik' }}>
      <div className="bg-[#050A1A]/95 backdrop-blur-xl border border-[#1E3050] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1E3050]">
          <h3 className="text-[15px] text-white font-semibold flex items-center gap-2" style={{ fontFamily: 'Unbounded' }}>
            <Train className="w-4 h-4 text-[#06B6D4]" />
            ION Station Simulator
          </h3>
          <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#1E3050] text-[#94A3B8] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {!clickedLocation && !loading && !result && (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Train className="w-6 h-6 text-[#06B6D4]" />
              </div>
              <p className="text-[14px] text-[#94A3B8]">Click anywhere on the map to place a hypothetical ION station</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin" />
              <p className="text-[13px] text-[#94A3B8]">Rescoring 17,717 parcels...</p>
            </div>
          )}

          {error && (
            <div className="bg-[#7F1D1D]/30 border border-[#EF4444]/30 text-[#FCA5A5] p-3 rounded-xl text-[13px]">
              {error}
            </div>
          )}

          {result && result.summary && (
            <div className="space-y-3">
              {/* Score change summary */}
              <div className="bg-[#0A0F2E] rounded-xl p-3 border border-[#06B6D4]/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-[#64748B] uppercase font-bold tracking-wider">Avg Score Impact</span>
                  <TrendingUp className="w-4 h-4 text-[#22C55E]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-[#94A3B8]">{result.summary.avg_score_before.toFixed(1)}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span className="text-[20px] font-bold text-[#22C55E]">{result.summary.avg_score_after.toFixed(1)}</span>
                </div>
              </div>

              {/* Top improved */}
              <div>
                <h4 className="text-[11px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Most Improved</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto hide-scrollbar">
                  {result.summary.top_20_most_improved.slice(0, 8).map((p, i) => (
                    <div key={p.parcel_id} className="flex items-center gap-2 bg-[#0A0F2E] rounded-lg p-2 border border-[#1E3050] text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
                      <span className="text-white truncate flex-1">{p.address}</span>
                      <span className="text-[#22C55E] font-bold">+{p.delta.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => { setResult(null); onSimulationResult(null); }}
                className="w-full py-2 rounded-lg border border-[#06B6D4]/30 text-[#06B6D4] text-[13px] font-medium hover:bg-[#06B6D4]/10 transition-colors"
              >
                Try Another Location
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
