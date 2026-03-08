import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, MapPin } from 'lucide-react';

export default function CitySelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  const handleSelect = () => {
    setLoading(true);
    setIsOpen(false);
    
    // Animate progress bar manually for visual effect
    setProgress(10);
    const interval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 20, 90));
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        navigate('/city/waterloo');
      }, 100);
    }, 500);
  };

  return (
    <div className="relative w-full max-w-[320px] mx-auto">
      {/* Loading Progress Bar at the top of the page */}
      {loading && (
        <div className="fixed top-0 left-0 w-full h-[3px] z-[60] bg-transparent overflow-hidden">
          <div 
            className="h-full bg-[#3B82F6] transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Dropdown Selector */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-[#111D32] border border-[#1E3050] rounded-xl px-4 py-3 text-left transition-all duration-300 hover:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
      >
        <span className="text-[#94A3B8] text-base">Select a city to explore...</span>
        <ChevronDown className={`w-5 h-5 text-[#64748B] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Options */}
      <div 
        className={`absolute top-full left-0 mt-2 w-full bg-[#111D32] border border-[#1E3050] rounded-xl overflow-hidden shadow-2xl z-20 transition-all duration-300 origin-top transform ${isOpen ? 'opacity-100 scale-y-100 pointer-events-auto' : 'opacity-0 scale-y-95 pointer-events-none'}`}
      >
        <button
          onClick={handleSelect}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#0F2035] transition-colors group"
        >
          <MapPin className="w-5 h-5 text-[#94A3B8] group-hover:text-[#3B82F6] transition-colors" />
          <span className="text-white font-medium">Waterloo, ON</span>
        </button>
      </div>
    </div>
  );
}
