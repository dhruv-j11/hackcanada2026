import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useScrollReveal, useTypingAnimation } from '../hooks/useAnimations';
import { 
  Sparkles, ArrowRight, Play, X
} from 'lucide-react';

/* ═══════════════════════════════════════════ */
/* ═══════════   LANDING PAGE   ═══════════ */
/* ═══════════════════════════════════════════ */

export default function LandingPage() {
  useScrollReveal();
  const navigate = useNavigate();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const pct = h.scrollTop / (h.scrollHeight - h.clientHeight);
      setScrollProgress(Math.min(pct * 100, 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const typedText = useTypingAnimation([
    'change King St to medium density housing',
    'add protected bike lanes on University Ave',
    'simulate 10-storey towers near ION stations',
    'create a pedestrian zone downtown',
    'plant 500 new trees along the corridor',
  ]);

  return (
    <div className="min-h-screen font-sans selection:bg-[#3B82F6] selection:text-white overflow-x-hidden">
      {/* Scroll progress bar */}
      <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />

      <Navbar />

      {/* ════════ SECTION 1 — HERO ════════ */}
      <section id="hero" className="relative min-h-screen flex items-start justify-center bg-[#0041BA] overflow-hidden pt-[20vh]">
        {/* Animated grid background */}
        <div className="absolute inset-0 grid-bg animate-grid opacity-30" />
        {/* Floating dots */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`dot-${i}`}
            className="floating-dot bg-white"
            style={{
              top: `${15 + Math.random() * 70}%`,
              left: `${5 + Math.random() * 90}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${5 + Math.random() * 4}s`,
            }}
          />
        ))}
        {/* Radial highlight */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 text-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[#93C5FD] text-[13px] font-medium mb-12">
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Urban Planning
            </div>
          </div>

          <h1 
            className="animate-fade-in-up text-[40px] md:text-[60px] lg:text-[76px] font-extrabold text-white tracking-[-0.03em] leading-tight mb-10 whitespace-nowrap mx-auto" 
            style={{ animationDelay: '0.1s', fontFamily: 'Unbounded' }}
          >
            Reimagine Your City.
          </h1>

          <p className="animate-fade-in-up text-[17px] md:text-[19px] text-white/80 max-w-[600px] mx-auto mb-12 leading-relaxed" style={{ animationDelay: '0.2s' }}>
            CityLens lets you visualize how neighborhoods could evolve. Simulate zoning, density, transit, and infrastructure changes instantly.
          </p>

          {/* CTA buttons */}
          <div className="animate-fade-in-up flex flex-col sm:flex-row items-center justify-center gap-4 mb-12" style={{ animationDelay: '0.3s' }}>
            <button
              onClick={() => navigate('/city/waterloo')}
              className="glow-button group flex items-center gap-2 px-7 py-3.5 bg-white text-[#0A1628] font-semibold rounded-xl hover:bg-gray-100 transition-all shadow-lg shadow-white/10 text-[15px]"
            >
              Try CityLens
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => setShowVideo(true)}
              className="flex items-center gap-2 px-7 py-3.5 border border-[#1E3050] text-[#94A3B8] hover:text-white hover:border-[#3B82F6]/40 rounded-xl transition-all text-[15px]"
            >
              <Play className="w-4 h-4" />
              Watch Demo
            </button>
          </div>

          {/* Fake prompt UI */}
          <div className="animate-fade-in-up max-w-xl mx-auto mt-16" style={{ animationDelay: '0.4s' }}>
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

      {/* ════════ SECTION 8 — FINAL CTA ════════ */}
      <section className="relative bg-gradient-to-b from-[#0041BA] to-[#04338F] py-32 md:py-40 overflow-hidden">
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
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 border border-[#1E3050] text-[#94A3B8] hover:text-white hover:border-[#3B82F6]/40 rounded-xl transition-all text-[15px]"
            >
              Join the Waitlist
            </button>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="bg-[#00318C] py-10 border-t border-[#04338F]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/60 text-[12px]">
            © 2026 CityLens · Built at Hack Canada 2026
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-white/60 text-[12px] hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-white/60 text-[12px] hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-white/60 text-[12px] hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
      
      {/* Video Modal */}
      {showVideo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowVideo(false)}>
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowVideo(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-white/20 text-white rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <video 
              src="/demovideo.mp4" 
              autoPlay 
              controls 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
