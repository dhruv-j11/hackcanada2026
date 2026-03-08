import { useState, useEffect } from 'react';
import { X, BarChart3, Users, DollarSign, Train, Building2, MapPin, FileText, Landmark, Loader2 } from 'lucide-react';
import type { AreaAnalysis } from '../services/apiService';
import { fetchAreaAnalysis, createAreaBrief } from '../services/apiService';

interface AreaAnalysisPanelProps {
  bbox: string | null; // "minLon,minLat,maxLon,maxLat"
  onClose: () => void;
  onParcelClick: (parcelId: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  'Low Opportunity': '#9e9e9e',
  'Moderate Opportunity': '#fdd835',
  'High Opportunity': '#f57c00',
  'Prime Opportunity': '#c62828',
};

function StatBlock({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color?: string;
}) {
  return (
    <div className="bg-[#0A0F2E] rounded-xl p-3 border border-[#1E3050]">
      <Icon className="w-4 h-4 mb-1.5" style={{ color: color || '#3B82F6' }} />
      <div className="text-[18px] font-bold text-white leading-tight">{value}</div>
      <div className="text-[11px] text-[#94A3B8] mt-0.5">{label}</div>
    </div>
  );
}

export default function AreaAnalysisPanel({ bbox, onClose, onParcelClick }: AreaAnalysisPanelProps) {
  const [data, setData] = useState<AreaAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  useEffect(() => {
    if (!bbox) { setData(null); setBriefText(null); return; }
    setLoading(true);
    setError(null);
    setBriefText(null);
    fetchAreaAnalysis(bbox)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [bbox]);

  const handleGenerateBrief = async () => {
    if (!data) return;
    setBriefLoading(true);
    try {
      const res = await createAreaBrief({ bbox: data.bbox });
      setBriefText(res.brief_text);
    } catch {
      setBriefText('Brief generation failed.');
    } finally {
      setBriefLoading(false);
    }
  };

  const isOpen = !!bbox;

  return (
    <div className={`absolute top-0 right-0 h-full w-full max-w-[420px] bg-[#050A1A]/95 backdrop-blur-xl border-l border-[#1E3050] z-20 flex flex-col transition-transform duration-400 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ fontFamily: 'Rubik' }}>
      <div className="flex-1 overflow-y-auto hide-scrollbar p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] text-white font-semibold flex items-center gap-2" style={{ fontFamily: 'Unbounded' }}>
            <BarChart3 className="w-5 h-5 text-[#3B82F6]" />
            Area Analysis
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#0A0F2E] hover:bg-[#1E3050] text-[#94A3B8] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-[#0A0F2E] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-[#7F1D1D]/30 border border-[#EF4444]/30 text-[#FCA5A5] p-4 rounded-xl text-[13px]">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatBlock icon={Building2} label="Total Parcels" value={data.total_parcels.toLocaleString()} />
              <StatBlock icon={BarChart3} label="Avg Score" value={data.avg_score.toFixed(1)} color="#06B6D4" />
              <StatBlock icon={Users} label="Est. Population Increase" value={`+${data.estimated_population_increase.toLocaleString()}`} color="#22C55E" />
              <StatBlock icon={Building2} label="Est. Additional Units" value={`+${data.estimated_additional_units.toLocaleString()}`} color="#8B5CF6" />
              <StatBlock icon={DollarSign} label="Est. Tax Revenue/yr" value={`$${(data.estimated_annual_tax_revenue / 1_000_000).toFixed(1)}M`} color="#F59E0B" />
              <StatBlock icon={Train} label="ION Ridership/day" value={`+${data.estimated_ion_ridership_daily.toLocaleString()}`} color="#06B6D4" />
            </div>

            {/* Tier Breakdown */}
            <div className="mb-5">
              <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Tier Breakdown</h3>
              <div className="bg-[#0A0F2E] rounded-xl p-3 border border-[#1E3050]">
                {Object.entries(data.tier_breakdown).map(([tier, count]) => {
                  const pct = data.total_parcels > 0 ? (count / data.total_parcels) * 100 : 0;
                  return (
                    <div key={tier} className="mb-2 last:mb-0">
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="text-[#94A3B8]">{tier}</span>
                        <span className="text-white font-medium">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 bg-[#1E3050] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[tier] || '#3B82F6' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cluster Breakdown */}
            {data.cluster_breakdown && Object.keys(data.cluster_breakdown).length > 0 && (
              <div className="mb-5">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Cluster Breakdown</h3>
                <div className="bg-[#0A0F2E] rounded-xl p-3 border border-[#1E3050] flex flex-wrap gap-2">
                  {Object.entries(data.cluster_breakdown).map(([name, count]) => (
                    <span key={name} className="bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#93C5FD] px-2.5 py-1 rounded-full text-[11px] font-medium">
                      {name}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Constraints */}
            {data.constraints_summary && data.constraints_summary.heritage_adjacent > 0 && (
              <div className="bg-[#422006]/30 border border-[#F59E0B]/20 rounded-xl p-3 mb-5 flex items-center gap-2.5">
                <Landmark className="w-4 h-4 text-[#F59E0B] flex-shrink-0" />
                <span className="text-[12px] text-[#FDE68A]">
                  {data.constraints_summary.heritage_adjacent} heritage-adjacent parcels in selection
                </span>
              </div>
            )}

            {/* Wards Affected */}
            {data.wards_affected && data.wards_affected.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Wards Affected</h3>
                <div className="space-y-1.5">
                  {data.wards_affected.map((w, i) => (
                    <div key={i} className="bg-[#0A0F2E] rounded-lg p-2.5 border border-[#1E3050] flex justify-between items-center text-[12px]">
                      <div>
                        <span className="text-white">{w.ward}</span>
                        <span className="text-[#64748B] ml-1.5">· {w.councillor}</span>
                      </div>
                      <span className="text-[#94A3B8] font-medium">{w.parcels} parcels</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top 10 Parcels */}
            <div className="mb-5">
              <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Top Opportunity Parcels</h3>
              <div className="space-y-1.5">
                {data.top_10_parcels.map((p, i) => (
                  <button
                    key={p.parcel_id}
                    onClick={() => onParcelClick(p.parcel_id)}
                    className="w-full bg-[#0A0F2E] rounded-lg p-2.5 border border-[#1E3050] flex items-center gap-3 text-[12px] hover:border-[#3B82F6]/50 transition-colors text-left"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-[#64748B] flex-shrink-0" />
                        <span className="text-white truncate">{p.address}</span>
                      </div>
                    </div>
                    <span className="text-[#06B6D4] font-bold">{p.score.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Brief */}
            <button
              onClick={handleGenerateBrief}
              disabled={briefLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {briefLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generate Community Brief
            </button>
            {briefText && (
              <div className="mt-3 bg-[#0A0F2E] border border-[#1E3050] rounded-xl p-3 text-[13px] text-[#CBD5E1] leading-relaxed max-h-[200px] overflow-y-auto hide-scrollbar">
                {briefText}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#1E3050] bg-[#050A1A]">
        <p className="text-center text-[11px] text-[#64748B]">
          Data: Region of Waterloo Open Data · Stats Canada Census 2021
        </p>
      </div>
    </div>
  );
}
