import { FileText, ArrowRightLeft, X } from 'lucide-react';
import * as icons from 'lucide-react';
import type { SimulationResult } from '../services/geminiService';

interface ResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  loading: boolean;
  result: SimulationResult | null;
  isSpeaking: boolean;
}

export default function ResultsPanel({ 
  isOpen, onClose, query, loading, result, isSpeaking 
}: ResultsPanelProps) {

  const formatStat = (key: string, value: number) => {
    if (key === 'taxRevenue') return `+$${(value / 1000000).toFixed(1)}M/yr`;
    if (key === 'waterDemand') return `+${value.toFixed(0)} ML/yr`;
    return `+${value.toLocaleString()}`;
  };

  const statConfig = [
    { key: 'housingUnits', label: 'Housing Units', icon: 'Home' },
    { key: 'newResidents', label: 'New Residents', icon: 'Users' },
    { key: 'taxRevenue', label: 'Tax Revenue', icon: 'DollarSign' },
    { key: 'waterDemand', label: 'Water Demand', icon: 'Droplets', warningKey: 'waterMoratoriumImpacted' },
    { key: 'transitRidership', label: 'ION Ridership', icon: 'Train' },
    { key: 'schoolChildren', label: 'School-Age Children', icon: 'GraduationCap' },
  ];

  return (
    <div 
      className={`absolute top-0 right-0 h-full w-full max-w-[380px] bg-[#0A1628]/95 backdrop-blur-xl border-l border-[#1E3050] z-20 flex flex-col transition-transform duration-400 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex-1 overflow-y-auto hide-scrollbar p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-[18px] text-white font-semibold flex items-center gap-2">
              Simulation Results
            </h2>
            {isSpeaking && (
              <div className="flex items-center gap-1.5 bg-[#3B82F6]/20 text-[#3B82F6] px-2 py-0.5 rounded-full border border-[#3B82F6]/30 animate-pulse">
                <div className="w-1.5 h-1.5 bg-[#3B82F6] rounded-full" />
                <span className="text-[10px] font-medium tracking-wide uppercase">AI Speaking</span>
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#111D32] hover:bg-[#1E3050] text-[#94A3B8] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {query && (
          <div className="pl-4 border-l-2 border-[#3B82F6] mb-8">
            <p className="text-[14px] text-[#94A3B8] italic">"{query}"</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="h-20 bg-[#111D32] rounded-xl animate-pulse" />
            <div className="flex gap-2 mb-2">
              <div className="h-6 w-20 bg-[#111D32] rounded-full animate-pulse" />
              <div className="h-6 w-32 bg-[#111D32] rounded-full animate-pulse" />
            </div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-[#111D32] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : result ? (
          <>
            <div className="mb-6 bg-[#111D32] border border-[#1E3050] p-4 rounded-xl leading-relaxed text-[14px] text-white">
              {result.narrative}
            </div>

            {result.risks && result.risks.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {result.risks.map((risk, i) => (
                  <span key={i} className="bg-[#581C87]/40 border border-[#7E22CE]/50 text-[#D8B4FE] px-2 py-1 rounded text-[11px] font-medium uppercase tracking-wide">
                    ⚠ {risk}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {statConfig.map((config, i) => {
                const IconComp = (icons as any)[config.icon] || icons.Activity;
                const isWarning = config.warningKey && (result as any)[config.warningKey];
                const val = (result.stats as any)[config.key] || 0;

                return (
                  <div 
                    key={i} 
                    className={`bg-[#111D32] rounded-xl p-4 border transition-colors ${isWarning ? 'border-[#EF4444]/50' : 'border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <IconComp className={`w-5 h-5 ${isWarning ? 'text-[#EF4444]' : 'text-[#3B82F6]'}`} />
                        {isWarning && (
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#EF4444] bg-[#EF4444]/10 px-2 py-0.5 rounded-full border border-[#EF4444]/20">
                            ⚠ Moratorium Zone
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[22px] font-bold text-white leading-tight mb-1">
                        {formatStat(config.key, val)}
                      </div>
                      <div className="text-[13px] text-[#94A3B8]">{config.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center text-[#94A3B8] italic mt-10">
            Submit a query to see simulation results.
          </div>
        )}
      </div>

      <div className="p-6 border-t border-[#1E3050] bg-[#0A1628]">
        <div className="flex gap-3 mb-6">
          <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#3B82F6]/10 transition-colors">
            <ArrowRightLeft className="w-4 h-4" />
            Compare
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-[14px] font-medium transition-colors">
            <FileText className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-[#64748B]">
            Data: Region of Waterloo Open Data · Stats Canada Census 2021
          </p>
        </div>
      </div>
    </div>
  );
}
