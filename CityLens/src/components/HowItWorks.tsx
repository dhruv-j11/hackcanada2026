
export default function HowItWorks() {
  const steps = [
    { num: 1, title: "Ask", desc: "Describe any zoning change in plain English or speak it aloud" },
    { num: 2, title: "Simulate", desc: "AI analyzes impact across housing, transit, water, revenue, and more" },
    { num: 3, title: "Visualize", desc: "See your city transform in real-time 3D with data overlays" }
  ];

  return (
    <div className="max-w-4xl mx-auto w-full px-4">
      <h2 className="text-[24px] font-semibold text-white text-center mb-12">How it works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 relative">
        {/* Connecting line for desktop */}
        <div className="hidden md:block absolute top-[24px] left-[16%] right-[16%] h-[2px] border-t-2 border-dashed border-[#1E3050] -z-10" />
        
        {steps.map((step) => (
          <div key={step.num} className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[#0A1628] border-2 border-[#3B82F6] flex items-center justify-center text-[#3B82F6] font-bold text-lg mb-6 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              {step.num}
            </div>
            <h3 className="text-white font-bold text-[16px] mb-3">{step.title}</h3>
            <p className="text-[#94A3B8] text-[14px] max-w-[240px] leading-relaxed">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
