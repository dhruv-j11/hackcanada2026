import { useState, useRef } from 'react';
import { rescoreByCategory } from '../services/apiService';
import { Home, Building2, Factory, Hammer, Landmark } from 'lucide-react';

interface CategorySelectorProps {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  onRefreshScores: () => void;
}

const CATEGORIES = [
  { id: 'residential', label: 'Residential', icon: Home },
  { id: 'commercial', label: 'Commercial', icon: Building2 },
  { id: 'industrial', label: 'Industrial', icon: Factory },
  { id: 'mixed_use', label: 'Mixed Use', icon: Hammer },
  { id: 'institutional', label: 'Institutional', icon: Landmark },
];

export default function CategorySelector({ activeCategory, onCategoryChange, onRefreshScores }: CategorySelectorProps) {
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = (catId: string) => {
    const newCategory = activeCategory === catId ? null : catId;
    // Toggle pill visual state IMMEDIATELY
    onCategoryChange(newCategory);

    // Debounce the actual API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newCategory === null) return; // No rescore needed when deselecting
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        await rescoreByCategory(newCategory);
        onRefreshScores();
      } catch (e) {
        console.error('Rescore failed:', e);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10" style={{ fontFamily: 'Rubik' }}>
      <div className="flex items-center gap-1.5 bg-[#0A0F2E]/90 backdrop-blur-md rounded-full px-2 py-1.5 border border-[#1E3050] shadow-lg">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              disabled={loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${
                activeCategory === cat.id
                  ? 'bg-[#3B82F6] text-white shadow-lg shadow-blue-500/20'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#1E3050]'
              } ${loading ? 'opacity-50 cursor-wait' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
