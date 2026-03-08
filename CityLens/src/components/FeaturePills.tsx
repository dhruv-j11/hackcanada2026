export default function FeaturePills() {
  const features = [
    "Natural Language Queries",
    "3D Visualization",
    "Real-Time Simulation",
    "Multi-Factor Analysis",
    "Voice Interface"
  ];

  return (
    <div className="flex flex-nowrap md:flex-wrap justify-start md:justify-center gap-3 overflow-x-auto pb-4 md:pb-0 hide-scrollbar px-6 md:px-0">
      {features.map((feature, i) => (
        <div 
          key={i}
          className="whitespace-nowrap bg-[#0F2035] shadow-sm border border-[#1E3050] text-[#94A3B8] px-4 py-2 rounded-full text-[13px] transition-all duration-300 hover:border-[#3B82F6] hover:text-white cursor-default"
        >
          {feature}
        </div>
      ))}
    </div>
  );
}
