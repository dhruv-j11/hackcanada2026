import { useState, useRef } from 'react';
import { rescoreByCategory } from '../services/apiService';

interface CategorySelectorProps {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  onRefreshScores: () => void;
}

const CATEGORIES = [
  { id: 'residential', label: 'Residential', emoji: '🏠' },
  { id: 'commercial', label: 'Commercial', emoji: '🏢' },
  { id: 'industrial', label: 'Industrial', emoji: '🏭' },
  { id: 'mixed_use', label: 'Mixed Use', emoji: '🏗️' },
  { id: 'institutional', label: 'Institutional', emoji: '🏛️' },
];

export default function CategorySelector({ activeCategory, onCategoryChange, onRefreshScores }: CategorySelectorProps) {
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = (catId: string) => {
    if (loading) return;
    if (activeCategory === catId) {
      onCategoryChange(null);
      return;
    }
    // Debounce: clear previous timer, wait 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        await rescoreByCategory(catId);
        onCategoryChange(catId);
        onRefreshScores();
      } catch (e) {
        console.error('Rescore failed:', e);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <div className="flex items-center gap-1.5 bg-[#111D32]/90 backdrop-blur-md rounded-full px-2 py-1.5 border border-[#1E3050] shadow-lg">
        {CATEGORIES.map(cat => (
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
            <span>{cat.emoji}</span>
            <span className="hidden md:inline">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
