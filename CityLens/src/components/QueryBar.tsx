import { useState } from 'react';
import { Mic, ArrowRight } from 'lucide-react';
import SuggestionChips from './SuggestionChips';
import { startVoiceInput } from '../services/elevenLabsService';

interface QueryBarProps {
  onQuerySubmit: (query: string) => void;
}

export default function QueryBar({ onQuerySubmit }: QueryBarProps) {
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onQuerySubmit(query);
      setQuery('');
    }
  };

  const handleMicClick = () => {
    if (recording) return;
    setRecording(true);
    startVoiceInput((text) => {
      setRecording(false);
      setQuery(text);
      // Auto submit voice
      if (text.trim()) {
        onQuerySubmit(text);
        setQuery('');
      }
    });
  };

  const handleSuggestionSelect = (text: string) => {
    setQuery(text);
    onQuerySubmit(text); // Auto submit suggestion
    setQuery('');
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] md:w-full max-w-[640px]">
      <div className="flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        <form 
          onSubmit={handleSubmit}
          className="flex items-center h-[56px] bg-[#111D32]/95 backdrop-blur-[16px] border border-[#1E3050] rounded-2xl px-2 shadow-[0_-4px_32px_rgba(59,130,246,0.05)]"
        >
          <button 
            type="button"
            onClick={handleMicClick}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${recording ? 'bg-red-500 animate-pulse text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-[#3B82F6] text-white hover:bg-blue-400'}`}
          >
            <Mic className="w-5 h-5" />
          </button>
          
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about any zoning change..."
            className="flex-1 bg-transparent border-none text-white px-4 placeholder:text-[#64748B] focus:outline-none text-[15px]"
          />
          
          <button 
            type="submit"
            className="w-10 h-10 rounded-full bg-[#3B82F6] text-white flex items-center justify-center hover:bg-blue-400 transition-colors flex-shrink-0"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <SuggestionChips onSelect={handleSuggestionSelect} />
      </div>
    </div>
  );
}
