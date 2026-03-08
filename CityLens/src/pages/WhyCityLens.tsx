import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import { ArrowRight, MoveRight, Database, Users, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function WhyCityLens() {
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#0041BA] text-white selection:bg-white/20">
      <Navbar />

      <main className="pt-24 md:pt-[15vh] pb-12 px-6 max-w-7xl mx-auto min-h-[100dvh] flex flex-col justify-center">
        <div className="animate-fade-in-up">
          <div className="inline-block px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[#93C5FD] text-[13px] font-medium mb-12">
            Why CityLens
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left Column - The Problem */}
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <h1 
              className="text-[40px] md:text-[56px] font-extrabold tracking-[-0.03em] leading-tight mb-8 whitespace-nowrap"
              style={{ fontFamily: 'Unbounded' }}
            >
              The gap between<br />vision and reality.
            </h1>
            
            <p className="text-[18px] text-white/80 leading-relaxed max-w-lg mb-12 font-medium">
              Canada needs 6 million more homes by 2030, but urban planning is stuck in the past. Text-heavy zoning bylaws and rigid planning regimes slow development to a crawl.
            </p>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/5">
                  <Database className="w-5 h-5 text-[#93C5FD]" />
                </div>
                <div>
                  <h3 className="font-bold text-[18px] mb-2 font-display" style={{ fontFamily: 'Unbounded' }}>Inaccessible Data</h3>
                  <p className="text-white/70 text-[15px] leading-relaxed">Zoning codes and GIS data are fragmented across archaic municipal portals, requiring expert translation.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/5">
                  <Users className="w-5 h-5 text-[#93C5FD]" />
                </div>
                <div>
                  <h3 className="font-bold text-[18px] mb-2 font-display" style={{ fontFamily: 'Unbounded' }}>Broken Engagement</h3>
                  <p className="text-white/70 text-[15px] leading-relaxed">Public consultations consist of confusing 2D PDFs that fail to communicate the real-world impact of proposals.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - The Solution */}
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="bg-[#050A1A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#3B82F6]/20 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
              
              <h2 className="text-[28px] font-bold mb-8 relative z-10" style={{ fontFamily: 'Unbounded' }}>
                Instant Urban Intelligence
              </h2>

              <div className="space-y-8 relative z-10">
                <div className="group border-l-2 border-[#3B82F6] pl-6 hover:border-[#60A5FA] transition-colors">
                  <h3 className="font-bold text-[18px] mb-2 text-white group-hover:text-[#93C5FD] transition-colors flex items-center gap-2" style={{ fontFamily: 'Unbounded' }}>
                    <Building2 className="w-4 h-4" /> 17,000 Parcels Scored
                  </h3>
                  <p className="text-[#94A3B8] text-[15px] leading-relaxed font-medium">
                    CityLens continuously evaluates every parcel of land in Waterloo for development readiness based on transit proximity, lot size, and current zoning limits.
                  </p>
                </div>

                <div className="group border-l-2 border-[#3B82F6] pl-6 hover:border-[#60A5FA] transition-colors">
                  <h3 className="font-bold text-[18px] mb-2 text-white group-hover:text-[#93C5FD] transition-colors flex items-center gap-2" style={{ fontFamily: 'Unbounded' }}>
                    <MoveRight className="w-4 h-4" /> Real-time 3D Scenarios
                  </h3>
                  <p className="text-[#94A3B8] text-[15px] leading-relaxed font-medium">
                    Type a prompt like "rezone for mid-rise housing" and watch the 3D map update instantly. Simulated impacts on tax revenue, water demand, and transit ridership are generated by Google Gemini.
                  </p>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-white/10 relative z-10">
                <button
                  onClick={() => navigate('/city/waterloo')}
                  className="w-full flex items-center justify-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white py-4 rounded-xl font-bold transition-all shadow-xl shadow-[#3B82F6]/20 group"
                >
                  Launch Interactive Platform
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
