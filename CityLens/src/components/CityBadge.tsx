import { MapPin, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CityBadge() {
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2" style={{ fontFamily: 'Rubik' }}>
      <div className="flex items-center gap-2 bg-[#0A0F2E]/90 backdrop-blur-md rounded-full px-4 py-2 border border-[#1E3050] shadow-lg">
        <MapPin className="w-4 h-4 text-[#94A3B8]" />
        <span className="text-white text-[14px] font-medium" style={{ fontFamily: 'Unbounded' }}>Waterloo, ON</span>
        <div className="flex items-center justify-center ml-1">
          <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
        </div>
      </div>
      <Link 
        to="/" 
        className="flex items-center gap-1.5 text-[#64748B] text-[13px] hover:text-[#94A3B8] transition-colors pl-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to home
      </Link>
    </div>
  );
}
