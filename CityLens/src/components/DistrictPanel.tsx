import { useState, useEffect } from 'react';
import { X, Map, ChevronRight, Users, Home, Briefcase, DollarSign, Loader2 } from 'lucide-react';
import type { DistrictInfo, DistrictDemographics } from '../services/apiService';
import { fetchDistricts, fetchDistrictDemographics } from '../services/apiService';

interface DistrictPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DistrictPanel({ isOpen, onClose }: DistrictPanelProps) {
  const [districts, setDistricts] = useState<DistrictInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [demo, setDemo] = useState<DistrictDemographics | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || districts.length > 0) return;
    setLoading(true);
    fetchDistricts()
      .then(d => setDistricts(Array.isArray(d) ? d : []))
      .catch(() => setDistricts([]))
      .finally(() => setLoading(false));
  }, [isOpen, districts.length]);

  const handleSelectDistrict = async (name: string) => {
    if (selected === name) { setSelected(null); setDemo(null); return; }
    setSelected(name);
    setDemoLoading(true);
    try {
      const d = await fetchDistrictDemographics(name);
      setDemo(d);
    } catch {
      setDemo(null);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className={`absolute top-0 left-0 h-full w-full max-w-[360px] bg-[#0A1628]/95 backdrop-blur-xl border-r border-[#1E3050] z-20 flex flex-col transition-transform duration-400 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex-1 overflow-y-auto hide-scrollbar p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] text-white font-semibold flex items-center gap-2">
            <Map className="w-5 h-5 text-[#3B82F6]" />
            Planning Districts
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#111D32] hover:bg-[#1E3050] text-[#94A3B8] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#3B82F6] animate-spin" />
          </div>
        )}

        {/* District List */}
        <div className="space-y-1.5">
          {districts.map(d => (
            <div key={d.name}>
              <button
                onClick={() => handleSelectDistrict(d.name)}
                className={`w-full flex items-center justify-between rounded-xl p-3 border text-left transition-all ${
                  selected === d.name
                    ? 'bg-[#3B82F6]/10 border-[#3B82F6]/30'
                    : 'bg-[#111D32] border-[#1E3050] hover:border-[#3B82F6]/20'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-[#64748B]">{d.parcel_count} parcels · Avg {d.avg_score.toFixed(1)}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-[#64748B] transition-transform ${selected === d.name ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded demographics */}
              {selected === d.name && (
                <div className="mt-1.5 ml-2 border-l-2 border-[#3B82F6]/30 pl-3 pb-2">
                  {demoLoading && (
                    <div className="py-4 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-[#3B82F6] animate-spin" />
                    </div>
                  )}
                  {demo && !demoLoading && (
                    <div className="space-y-2.5 animate-fade-in">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#0A1628] rounded-lg p-2.5 border border-[#1E3050]">
                          <Users className="w-3.5 h-3.5 text-[#3B82F6] mb-1" />
                          <div className="text-[14px] font-bold text-white">{demo.population?.toLocaleString()}</div>
                          <div className="text-[10px] text-[#64748B]">Population</div>
                        </div>
                        <div className="bg-[#0A1628] rounded-lg p-2.5 border border-[#1E3050]">
                          <DollarSign className="w-3.5 h-3.5 text-[#22C55E] mb-1" />
                          <div className="text-[14px] font-bold text-white">${demo.median_household_income?.toLocaleString()}</div>
                          <div className="text-[10px] text-[#64748B]">Median Income</div>
                        </div>
                        <div className="bg-[#0A1628] rounded-lg p-2.5 border border-[#1E3050]">
                          <Home className="w-3.5 h-3.5 text-[#F59E0B] mb-1" />
                          <div className="text-[14px] font-bold text-white">{demo.total_households?.toLocaleString()}</div>
                          <div className="text-[10px] text-[#64748B]">Households</div>
                        </div>
                        <div className="bg-[#0A1628] rounded-lg p-2.5 border border-[#1E3050]">
                          <Briefcase className="w-3.5 h-3.5 text-[#EF4444] mb-1" />
                          <div className="text-[14px] font-bold text-white">{demo.unemployment_rate}%</div>
                          <div className="text-[10px] text-[#64748B]">Unemployment</div>
                        </div>
                      </div>

                      {/* Tenure split */}
                      {demo.tenure && (
                        <div className="bg-[#0A1628] rounded-lg p-2.5 border border-[#1E3050]">
                          <div className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider mb-1.5">Tenure Split</div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div className="bg-[#3B82F6]" style={{ width: `${demo.tenure.owner?.percent || 0}%` }} />
                            <div className="bg-[#06B6D4]" style={{ width: `${demo.tenure.renter?.percent || 0}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] mt-1">
                            <span className="text-[#3B82F6]">Own {demo.tenure.owner?.percent}%</span>
                            <span className="text-[#06B6D4]">Rent {demo.tenure.renter?.percent}%</span>
                          </div>
                        </div>
                      )}

                      {demo.core_housing_need_pct != null && (
                        <div className="text-[11px] text-[#F59E0B]/80 bg-[#422006]/20 border border-[#F59E0B]/10 rounded-lg p-2">
                          ⚠ Core Housing Need: {demo.core_housing_need_pct}%
                        </div>
                      )}
                    </div>
                  )}
                  {!demo && !demoLoading && (
                    <p className="text-[12px] text-[#64748B] py-2">Census data not available for this district.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
