import { useState, useEffect } from 'react';
import { X, MapPin, Building2, Clock, Ruler, Shield, Landmark, Users, Sparkles, AlertTriangle, Lock, Unlock, ChevronDown, ChevronUp, Send } from 'lucide-react';
import type { ParcelExplanation } from '../services/apiService';
import { fetchParcelExplanation, fetchImpactAnalysis } from '../services/apiService';

interface ParcelDetailPanelProps {
  parcelId: string | null;
  onClose: () => void;
}

const TIER_COLORS: Record<string, string> = {
  grey: '#9e9e9e',
  yellow: '#fdd835',
  orange: '#f57c00',
  red: '#c62828',
};

function ScoreGauge({ score, tier, tierColor }: { score: number; tier: string; tierColor: string }) {
  const color = TIER_COLORS[tierColor] || '#9e9e9e';
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E3050" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-white">
          {score.toFixed(0)}
        </span>
      </div>
      <div>
        <span
          className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {tier}
        </span>
      </div>
    </div>
  );
}

function FeatureBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const displayLabel = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-[#94A3B8]">{displayLabel}</span>
        <span className="text-white font-medium">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-[#1E3050] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#3B82F6] to-[#06B6D4] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ParcelDetailPanel({ parcelId, onClose }: ParcelDetailPanelProps) {
  const [data, setData] = useState<ParcelExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCensus, setShowCensus] = useState(false);
  const [impactQuery, setImpactQuery] = useState('');
  const [impactResult, setImpactResult] = useState<string | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    if (!parcelId) { setData(null); return; }
    setLoading(true);
    setError(null);
    setImpactResult(null);
    fetchParcelExplanation(parcelId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [parcelId]);

  const handleImpactSubmit = async () => {
    if (!impactQuery.trim() || !parcelId) return;
    setImpactLoading(true);
    try {
      const res = await fetchImpactAnalysis(parcelId, impactQuery);
      setImpactResult(res.analysis);
    } catch {
      setImpactResult('Impact analysis unavailable. Ensure GEMINI_API_KEY is set on the backend.');
    } finally {
      setImpactLoading(false);
    }
  };

  const isOpen = !!parcelId;

  return (
    <div className={`absolute top-0 right-0 h-full w-full max-w-[400px] bg-[#0A1628]/95 backdrop-blur-xl border-l border-[#1E3050] z-20 flex flex-col transition-transform duration-400 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex-1 overflow-y-auto hide-scrollbar p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] text-white font-semibold">Parcel Details</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#111D32] hover:bg-[#1E3050] text-[#94A3B8] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-[#111D32] rounded-xl animate-pulse" />
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
            {/* Score */}
            <ScoreGauge score={data.score} tier={data.tier} tierColor={
              data.score <= 30 ? 'grey' : data.score <= 60 ? 'yellow' : data.score <= 80 ? 'orange' : 'red'
            } />

            {/* Address + Meta */}
            <div className="bg-[#111D32] rounded-xl p-4 border border-[#1E3050] mb-4">
              <div className="flex items-start gap-2 mb-3">
                <MapPin className="w-4 h-4 text-[#3B82F6] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white text-[14px] font-medium">{data.top_3_contributing_features.length > 0 ? '' : ''}{data.explanation?.split('.')[0] || `Parcel ${data.parcel_id}`}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="flex items-center gap-1.5 text-[#94A3B8]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="capitalize">{data.cluster_name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#94A3B8]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{data.district_name}</span>
                </div>
              </div>
            </div>

            {/* Top Contributing Features */}
            {data.top_3_contributing_features && data.top_3_contributing_features.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-3">Top Factors</h3>
                {data.top_3_contributing_features.map((f, i) => (
                  <FeatureBar
                    key={i}
                    label={f.feature}
                    value={f.contribution}
                    max={Math.max(...data.top_3_contributing_features.map(x => x.contribution))}
                  />
                ))}
              </div>
            )}

            {/* Ward & Councillor */}
            <div className="bg-[#111D32] rounded-xl p-3 border border-[#1E3050] mb-4 flex items-center gap-3">
              <Users className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
              <div className="text-[13px]">
                <span className="text-white">{data.ward}</span>
                <span className="text-[#64748B] mx-1.5">·</span>
                <span className="text-[#94A3B8]">{data.councillor}</span>
              </div>
            </div>

            {/* Heritage Note */}
            {data.heritage_note && (
              <div className="bg-[#422006]/30 border border-[#F59E0B]/20 rounded-xl p-3 mb-4 flex items-start gap-2.5">
                <Landmark className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-[#FDE68A] leading-relaxed">{data.heritage_note}</p>
              </div>
            )}

            {/* Strengths */}
            {data.strengths && data.strengths.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" /> Strengths
                </h3>
                {data.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5 text-[12px] text-[#86EFAC]">
                    <span className="mt-1 w-1.5 h-1.5 bg-[#22C55E] rounded-full flex-shrink-0" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Risks */}
            {data.risks && data.risks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" /> Risks
                </h3>
                {data.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5 text-[12px] text-[#FDE68A]">
                    <span className="mt-1 w-1.5 h-1.5 bg-[#F59E0B] rounded-full flex-shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Constraints */}
            {data.constraints && data.constraints.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#EF4444]" /> Constraints
                </h3>
                {data.constraints.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5 text-[12px] text-[#FCA5A5]">
                    <span className="mt-1 w-1.5 h-1.5 bg-[#EF4444] rounded-full flex-shrink-0" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Unlock Suggestions */}
            {data.unlock_suggestions && data.unlock_suggestions.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5 text-[#06B6D4]" /> Unlock Opportunities
                </h3>
                {data.unlock_suggestions.map((u, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5 text-[12px] text-[#67E8F9]">
                    <span className="mt-1 w-1.5 h-1.5 bg-[#06B6D4] rounded-full flex-shrink-0" />
                    <span>{u}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Census Context (collapsible) */}
            {data.district_context && (
              <div className="mb-4">
                <button
                  onClick={() => setShowCensus(!showCensus)}
                  className="flex items-center justify-between w-full text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 hover:text-[#94A3B8] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5" /> Census Context — {data.district_context.district}
                  </span>
                  {showCensus ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showCensus && (
                  <div className="bg-[#111D32] rounded-xl p-3 border border-[#1E3050] grid grid-cols-2 gap-3 text-[12px] animate-fade-in">
                    <div>
                      <span className="text-[#64748B]">Population</span>
                      <p className="text-white font-medium">{data.district_context.population.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Median Age</span>
                      <p className="text-white font-medium">{data.district_context.median_age}</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Median Income</span>
                      <p className="text-white font-medium">${data.district_context.median_household_income?.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Core Housing Need</span>
                      <p className="text-white font-medium">{data.district_context.core_housing_need_pct}%</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Owner</span>
                      <p className="text-white font-medium">{data.district_context.owner_pct}%</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Renter</span>
                      <p className="text-white font-medium">{data.district_context.renter_pct}%</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shield divider */}
            <div className="border-t border-[#1E3050] my-4" />

            {/* Impact Analysis */}
            <div className="mb-4">
              <h3 className="text-[12px] uppercase text-[#64748B] font-bold tracking-wider mb-2 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#8B5CF6]" /> AI Impact Analysis
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-[#111D32] border border-[#1E3050] rounded-lg px-3 py-2 text-white text-[13px] focus:outline-none focus:border-[#3B82F6] placeholder-[#334155]"
                  placeholder="e.g. Build a grocery store"
                  value={impactQuery}
                  onChange={e => setImpactQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleImpactSubmit()}
                />
                <button
                  onClick={handleImpactSubmit}
                  disabled={impactLoading}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {impactLoading && (
                <div className="mt-3 h-20 bg-[#111D32] rounded-xl animate-pulse" />
              )}
              {impactResult && !impactLoading && (
                <div className="mt-3 bg-[#111D32] border border-[#1E3050] rounded-xl p-3 text-[13px] text-[#CBD5E1] leading-relaxed max-h-[200px] overflow-y-auto hide-scrollbar">
                  {impactResult}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#1E3050] bg-[#0A1628]">
        <p className="text-center text-[11px] text-[#64748B]">
          Data: Region of Waterloo Open Data · Stats Canada Census 2021
        </p>
      </div>
    </div>
  );
}
