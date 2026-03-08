const TIERS = [
  { color: '#9e9e9e', label: '0–30', name: 'Low' },
  { color: '#fdd835', label: '31–60', name: 'Moderate' },
  { color: '#f57c00', label: '61–80', name: 'High' },
  { color: '#c62828', label: '81–100', name: 'Prime' },
];

export default function ScoreLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-10">
      <div className="bg-[#111D32]/90 backdrop-blur-md rounded-xl px-3 py-2.5 border border-[#1E3050] shadow-lg">
        <div className="text-[10px] uppercase text-[#64748B] font-bold tracking-wider mb-2">Opportunity Score</div>
        <div className="flex flex-col gap-1.5">
          {TIERS.map(tier => (
            <div key={tier.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: tier.color }}
              />
              <span className="text-[11px] text-[#94A3B8]">
                <span className="text-white font-medium">{tier.label}</span> {tier.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
