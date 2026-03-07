import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useScrollReveal, useCountUp, useTypingAnimation } from '../hooks/useAnimations';
import { 
  Building2, Users, BarChart3, Bike, Train, Trees, Layers, MapPin, 
  Sparkles, ArrowRight, ChevronRight, Play
} from 'lucide-react';

/* ───────── STAT COUNTER ───────── */
function StatCounter({ end, suffix, label }: { end: number; suffix: string; label: string }) {
  const { count, ref } = useCountUp(end, 2200);
  return (
    <div ref={ref} className="text-center">
      <div className="text-[56px] md:text-[72px] font-extrabold tracking-tight text-white leading-none">
        {count}<span className="text-[#3B82F6]">{suffix}</span>
      </div>
      <p className="mt-3 text-[15px] text-[#94A3B8] max-w-[220px] mx-auto">{label}</p>
    </div>
  );
}

/* ───────── FEATURE CARD ───────── */
function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) {
  return (
    <div
      className="scroll-reveal glass-card p-7 flex flex-col gap-4 group cursor-default"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="w-11 h-11 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] group-hover:bg-[#3B82F6]/20 transition-colors">
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold text-white">{title}</h3>
      <p className="text-[14px] text-[#94A3B8] leading-relaxed">{desc}</p>
    </div>
  );
}

/* ───────── PROBLEM CARD ───────── */
function ProblemCard({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) {
  return (
    <div
      className="scroll-reveal bg-white rounded-2xl p-8 flex flex-col items-start gap-4 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#3B82F6]">
        {icon}
      </div>
      <h3 className="text-[18px] font-semibold text-[#0F172A]">{title}</h3>
      <p className="text-[14px] text-[#64748B] leading-relaxed">{desc}</p>
    </div>
  );
}

/* ───────── SKYLINE SVG ───────── */
function SkylineSVG() {
  return (
    <svg viewBox="0 0 1200 200" className="w-full h-auto opacity-40" preserveAspectRatio="none">
      {[
        { x: 40, w: 30, h: 80 }, { x: 80, w: 50, h: 140 }, { x: 140, w: 25, h: 60 },
        { x: 180, w: 40, h: 110 }, { x: 230, w: 55, h: 170 }, { x: 300, w: 30, h: 90 },
        { x: 340, w: 45, h: 130 }, { x: 400, w: 35, h: 75 }, { x: 450, w: 60, h: 160 },
        { x: 520, w: 25, h: 50 }, { x: 560, w: 50, h: 120 }, { x: 620, w: 40, h: 145 },
        { x: 680, w: 30, h: 70 }, { x: 720, w: 55, h: 155 }, { x: 790, w: 35, h: 95 },
        { x: 840, w: 45, h: 125 }, { x: 900, w: 25, h: 65 }, { x: 940, w: 50, h: 140 },
        { x: 1000, w: 40, h: 100 }, { x: 1060, w: 55, h: 175 }, { x: 1130, w: 30, h: 85 }
      ].map((b, i) => (
        <rect key={i} x={b.x} y={200 - b.h} width={b.w} height={b.h} rx={2}
          fill="#3B82F6"
          style={{ transformOrigin: `${b.x + b.w/2}px 200px`, animation: `skyline-rise 1.2s cubic-bezier(0.16,1,0.3,1) ${0.05*i}s both` }}
        />
      ))}
      <line x1="0" y1="200" x2="1200" y2="200" stroke="#3B82F6" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

/* ═══════════════════════════════════════════ */
/* ═══════════   LANDING PAGE   ═══════════ */
/* ═══════════════════════════════════════════ */

export default function LandingPage() {
  useScrollReveal();
  const navigate = useNavigate();

  const typedText = useTypingAnimation([
    'change King St to medium density housing',
    'add protected bike lanes on University Ave',
    'simulate 10-storey towers near ION stations',
    'create a pedestrian zone downtown',
    'plant 500 new trees along the corridor',
  ]);

  return (
    <div className="min-h-screen font-sans selection:bg-[#3B82F6] selection:text-white overflow-x-hidden">
      <Navbar />

      {/* ════════ SECTION 1 — HERO ════════ */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-b from-[#060E1A] via-[#0A1628] to-[#0F2035] overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 grid-bg animate-grid opacity-60" />
        {/* Radial highlight */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#3B82F6]/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-24">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#60A5FA] text-[13px] font-medium mb-8">
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Urban Planning
            </div>
          </div>

          <h1 className="animate-fade-in-up text-[40px] md:text-[64px] lg:text-[72px] font-extrabold text-white tracking-[-0.03em] leading-[1.05] mb-6" style={{ animationDelay: '0.1s' }}>
            Reimagine Your<br />
            <span className="bg-gradient-to-r from-[#3B82F6] to-[#06B6D4] bg-clip-text text-transparent">City.</span>
          </h1>

          <p className="animate-fade-in-up text-[17px] md:text-[19px] text-[#94A3B8] max-w-[580px] mx-auto mb-10 leading-relaxed" style={{ animationDelay: '0.2s' }}>
            CityLens lets you visualize how neighborhoods could evolve. Simulate zoning, density, transit, and infrastructure changes instantly.
          </p>

          {/* CTA buttons */}
          <div className="animate-fade-in-up flex flex-col sm:flex-row items-center justify-center gap-4 mb-12" style={{ animationDelay: '0.3s' }}>
            <button
              onClick={() => navigate('/city/waterloo')}
              className="group flex items-center gap-2 px-7 py-3.5 bg-white text-[#0A1628] font-semibold rounded-xl hover:bg-gray-100 transition-all shadow-lg shadow-white/10 text-[15px]"
            >
              Try CityLens
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button className="flex items-center gap-2 px-7 py-3.5 border border-[#1E3050] text-[#94A3B8] hover:text-white hover:border-[#3B82F6]/40 rounded-xl transition-all text-[15px]">
              <Play className="w-4 h-4" />
              Watch Demo
            </button>
          </div>

          {/* Fake prompt UI */}
          <div className="animate-fade-in-up max-w-xl mx-auto" style={{ animationDelay: '0.4s' }}>
            <div className="bg-[#111D32]/80 border border-[#1E3050] rounded-2xl p-5 backdrop-blur-xl animate-pulse-glow">
              <div className="flex items-center gap-3">
                <span className="text-[#3B82F6] font-mono text-[15px]">{">"}</span>
                <span className="text-white font-mono text-[14px] md:text-[15px]">{typedText}</span>
                <span className="text-[#3B82F6] animate-blink font-mono">|</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ════════ SECTION 2 — PROBLEM ════════ */}
      <section className="relative bg-white py-28 md:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="scroll-reveal text-[32px] md:text-[44px] font-bold text-[#0F172A] tracking-[-0.02em] leading-tight">
              Cities Change Slowly.<br />Ideas Move Fast.
            </h2>
            <p className="scroll-reveal mt-5 text-[16px] text-[#64748B] max-w-lg mx-auto">
              The gap between urban vision and reality is wider than ever.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ProblemCard 
              icon={<Building2 className="w-6 h-6" />}
              title="Urban Planning Bottleneck"
              desc="Planning changes are difficult to communicate visually. Stakeholders struggle to align on proposals without seeing them."
              delay={0}
            />
            <ProblemCard 
              icon={<Users className="w-6 h-6" />}
              title="Community Engagement"
              desc="Residents struggle to imagine what proposals actually look like. Public consultations lack immersive, tangible previews."
              delay={100}
            />
            <ProblemCard 
              icon={<BarChart3 className="w-6 h-6" />}
              title="Data Complexity"
              desc="Urban data is powerful but hard to interpret. Zoning codes, density metrics, and transit data need visual translation."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* ════════ SECTION 3 — PRODUCT DEMO ════════ */}
      <section className="relative bg-[#0A1628] py-28 md:py-36 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white to-transparent" />

        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="scroll-reveal text-[32px] md:text-[44px] font-bold text-white tracking-[-0.02em]">
              See the Future of Your Neighborhood
            </h2>
            <p className="scroll-reveal mt-5 text-[16px] text-[#94A3B8] max-w-lg mx-auto">
              Type a prompt. Watch your city transform in real-time.
            </p>
          </div>

          <div className="scroll-reveal max-w-4xl mx-auto">
            <div className="bg-[#111D32] border border-[#1E3050] rounded-3xl overflow-hidden shadow-2xl shadow-[#3B82F6]/5">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-5 py-3 bg-[#0A1628] border-b border-[#1E3050]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
                  <div className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
                  <div className="w-3 h-3 rounded-full bg-[#22C55E]/80" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-lg bg-[#111D32] text-[#64748B] text-[12px] font-mono">
                    citylens.ai/simulate
                  </div>
                </div>
              </div>

              {/* Demo content */}
              <div className="p-8 md:p-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                  {/* Left: prompt */}
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-[#64748B] mb-4 font-medium">Input Prompt</p>
                    <div className="space-y-3">
                      {['Add bike lanes', 'Increase density', 'Create pedestrian zone', 'Plant more trees'].map((p, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0A1628] border border-[#1E3050] hover:border-[#3B82F6]/30 transition-colors cursor-default group">
                          <ChevronRight className="w-4 h-4 text-[#3B82F6] group-hover:translate-x-0.5 transition-transform" />
                          <span className="text-[14px] text-[#94A3B8] group-hover:text-white transition-colors">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: visualization placeholder */}
                  <div className="relative">
                    <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-[#0F2035] to-[#162B4A] border border-[#1E3050] flex items-center justify-center overflow-hidden">
                      <div className="text-center">
                        <MapPin className="w-10 h-10 text-[#3B82F6]/40 mx-auto mb-3 animate-float" />
                        <p className="text-[#64748B] text-sm">Live visualization preview</p>
                      </div>
                      {/* Simulated grid blocks */}
                      <div className="absolute bottom-0 inset-x-0 flex items-end justify-center gap-1.5 px-6 pb-4">
                        {[30, 55, 40, 70, 35, 60, 45, 75, 50, 65, 38, 58].map((h, i) => (
                          <div key={i}
                            className="rounded-t bg-[#3B82F6]/20 border border-[#3B82F6]/10 flex-1"
                            style={{ height: `${h}%`, animationDelay: `${i * 0.08}s`, animation: `skyline-rise 1s cubic-bezier(0.16,1,0.3,1) ${0.1*i}s both` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ SECTION 4 — STATISTICS ════════ */}
      <section className="relative bg-white py-28 md:py-36">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            <StatCounter end={70} suffix="%" label="of urban land is underutilized" />
            <StatCounter end={45} suffix="%" label="of city emissions come from transportation" />
            <StatCounter end={3} suffix="x faster" label="visual planning decisions with simulation tools" />
          </div>
        </div>
      </section>

      {/* ════════ SECTION 5 — FEATURE GRID ════════ */}
      <section className="relative bg-[#0A1628] py-28 md:py-36 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#3B82F6]/4 rounded-full blur-[150px] pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="scroll-reveal text-[32px] md:text-[44px] font-bold text-white tracking-[-0.02em]">
              What You Can Do With CityLens
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard icon={<Sparkles className="w-5 h-5" />} title="Prompt-Based City Editing" desc="Describe changes in plain language. AI interprets and visualizes your ideas in real-time." delay={0} />
            <FeatureCard icon={<Building2 className="w-5 h-5" />} title="Zoning Visualization" desc="See how density changes reshape neighborhoods. Understand height, FAR, and setback impacts." delay={80} />
            <FeatureCard icon={<Train className="w-5 h-5" />} title="Transit Simulation" desc="Understand the impact of transit infrastructure on neighborhoods and ridership patterns." delay={160} />
            <FeatureCard icon={<Users className="w-5 h-5" />} title="Community Scenarios" desc="Generate multiple futures for the same area. Compare outcomes side-by-side." delay={240} />
            <FeatureCard icon={<Trees className="w-5 h-5" />} title="Environmental Impact" desc="Visualize greenery, emissions reduction, walkability scores, and urban heat impacts." delay={320} />
            <FeatureCard icon={<Layers className="w-5 h-5" />} title="Urban Data Layers" desc="Overlay zoning codes, demographics, infrastructure, and transit routes on a single canvas." delay={400} />
          </div>
        </div>
      </section>

      {/* ════════ SECTION 6 — INTERACTIVE MAP ════════ */}
      <section className="relative bg-white py-28 md:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="scroll-reveal text-[32px] md:text-[44px] font-bold text-[#0F172A] tracking-[-0.02em]">
              Explore the Layers
            </h2>
            <p className="scroll-reveal mt-5 text-[16px] text-[#64748B] max-w-lg mx-auto">
              Toggle urban layers and watch the city transform.
            </p>
          </div>

          <div className="scroll-reveal max-w-4xl mx-auto">
            <InteractiveLayerDemo />
          </div>
        </div>
      </section>

      {/* ════════ SECTION 7 — VISION ════════ */}
      <section className="relative bg-[#F8FAFC] py-28 md:py-36 overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="scroll-reveal text-[32px] md:text-[44px] font-bold text-[#0F172A] tracking-[-0.02em] mb-6">
            Cities Designed With Everyone in Mind
          </h2>
          <p className="scroll-reveal text-[16px] text-[#64748B] max-w-2xl mx-auto leading-relaxed mb-16">
            CityLens empowers urban planners, city councils, and everyday citizens to collaboratively visualize better cities. 
            By making complex urban data tangible and interactive, we bridge the gap between vision and reality — 
            enabling more inclusive, sustainable, and human-centered development decisions.
          </p>

          <div className="scroll-reveal">
            <SkylineSVG />
          </div>
        </div>
      </section>

      {/* ════════ SECTION 8 — FINAL CTA ════════ */}
      <section className="relative bg-gradient-to-b from-[#0A1628] to-[#060E1A] py-32 md:py-40 overflow-hidden">
        {/* network bg */}
        <div className="absolute inset-0">
          <svg className="w-full h-full opacity-15" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
            {[
              [100, 80], [200, 300], [350, 150], [500, 280], [650, 100], [750, 320],
              [150, 220], [400, 350], [600, 200], [300, 50], [550, 370], [700, 180]
            ].map(([x, y], i) => (
              <g key={`node-${i}`}>
                <circle cx={x} cy={y} r={3} fill="#3B82F6" opacity={0.6} />
                {i > 0 && (
                  <line
                    x1={[
                      [100, 80], [200, 300], [350, 150], [500, 280], [650, 100], [750, 320],
                      [150, 220], [400, 350], [600, 200], [300, 50], [550, 370], [700, 180]
                    ][i-1][0]}
                    y1={[
                      [100, 80], [200, 300], [350, 150], [500, 280], [650, 100], [750, 320],
                      [150, 220], [400, 350], [600, 200], [300, 50], [550, 370], [700, 180]
                    ][i-1][1]}
                    x2={x} y2={y}
                    stroke="#3B82F6" strokeWidth={0.5} opacity={0.3}
                  />
                )}
              </g>
            ))}
          </svg>
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="scroll-reveal text-[36px] md:text-[52px] font-extrabold text-white tracking-[-0.03em] leading-tight mb-6">
            Start Exploring<br />Your City
          </h2>
          <p className="scroll-reveal text-[16px] text-[#94A3B8] max-w-md mx-auto mb-10">
            Join thousands of planners and citizens already reshaping urban futures with CityLens.
          </p>
          <div className="scroll-reveal flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/city/waterloo')}
              className="group flex items-center gap-2 px-8 py-4 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[#3B82F6]/25 text-[15px]"
            >
              Try CityLens
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button className="px-8 py-4 border border-[#1E3050] text-[#94A3B8] hover:text-white hover:border-[#3B82F6]/40 rounded-xl transition-all text-[15px]">
              Join the Waitlist
            </button>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="bg-[#060E1A] py-10 border-t border-[#1E3050]/60">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[#64748B] text-[12px]">
            © 2026 CityLens · Built at Hack Canada 2026
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[#64748B] text-[12px] hover:text-[#94A3B8] transition-colors">Privacy</a>
            <a href="#" className="text-[#64748B] text-[12px] hover:text-[#94A3B8] transition-colors">Terms</a>
            <a href="#" className="text-[#64748B] text-[12px] hover:text-[#94A3B8] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────── INTERACTIVE LAYER DEMO ───────── */
function InteractiveLayerDemo() {
  const layers = [
    { id: 'density', label: 'Housing Density', icon: <Building2 className="w-4 h-4" />, color: '#3B82F6' },
    { id: 'bike', label: 'Bike Lanes', icon: <Bike className="w-4 h-4" />, color: '#22C55E' },
    { id: 'transit', label: 'Public Transit', icon: <Train className="w-4 h-4" />, color: '#06B6D4' },
    { id: 'parks', label: 'Parks', icon: <Trees className="w-4 h-4" />, color: '#84CC16' },
  ];

  // Use a simple approach: render a fake map with visual indicators
  return (
    <div className="bg-[#F1F5F9] rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Toggle bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white overflow-x-auto hide-scrollbar">
        {layers.map((l) => (
          <button key={l.id} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all bg-[#EFF6FF] text-[#3B82F6] border border-[#3B82F6]/20 hover:shadow-md whitespace-nowrap">
            {l.icon}
            {l.label}
          </button>
        ))}
      </div>

      {/* Fake map area */}
      <div className="relative h-[360px] bg-gradient-to-br from-[#E2E8F0] to-[#CBD5E1] overflow-hidden">
        {/* Grid streets */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 600 360">
          {/* Horizontal roads */}
          {[60, 120, 180, 240, 300].map(y => (
            <line key={`h${y}`} x1="0" y1={y} x2="600" y2={y} stroke="#94A3B8" strokeWidth="1" opacity="0.25" />
          ))}
          {/* Vertical roads */}
          {[80, 160, 240, 320, 400, 480, 560].map(x => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="360" stroke="#94A3B8" strokeWidth="1" opacity="0.25" />
          ))}
          {/* Buildings */}
          {[
            { x: 95, y: 70, w: 50, h: 35 }, { x: 175, y: 70, w: 45, h: 40 },
            { x: 255, y: 130, w: 50, h: 35 }, { x: 335, y: 70, w: 55, h: 40 },
            { x: 415, y: 130, w: 45, h: 30 }, { x: 95, y: 190, w: 50, h: 35 },
            { x: 175, y: 250, w: 40, h: 35 }, { x: 335, y: 190, w: 55, h: 40 },
            { x: 255, y: 250, w: 50, h: 30 }, { x: 495, y: 70, w: 45, h: 35 },
            { x: 415, y: 250, w: 50, h: 40 }, { x: 495, y: 190, w: 55, h: 35 },
          ].map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={3}
              fill="#3B82F6" opacity={0.15 + (i % 3) * 0.08}
              stroke="#3B82F6" strokeWidth="0.5" strokeOpacity="0.2"
            />
          ))}
          {/* Transit line */}
          <path d="M60,30 L150,100 L300,150 L450,180 L560,340" stroke="#06B6D4" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" strokeDasharray="8 4" />
          {/* Green spaces */}
          {[{ cx: 200, cy: 320, r: 18 }, { cx: 420, cy: 320, r: 22 }].map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="#22C55E" opacity="0.2" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.3" />
          ))}
        </svg>

        {/* Center label */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl shadow-sm border border-gray-200">
          <p className="text-[12px] text-[#64748B] font-medium">Toggle layers to explore</p>
        </div>
      </div>
    </div>
  );
}
