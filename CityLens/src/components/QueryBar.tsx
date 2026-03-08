import { useState, useRef, useCallback } from 'react';
import { Mic, ArrowRight, Loader2 } from 'lucide-react';
import SuggestionChips from './SuggestionChips';

interface QueryBarProps {
  onQuerySubmit: (query: string) => void;
}

export default function QueryBar({ onQuerySubmit }: QueryBarProps) {
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !submitting) {
      setSubmitting(true);
      onQuerySubmit(query);
      setQuery('');
      // Brief delay to prevent double-submit
      setTimeout(() => setSubmitting(false), 500);
    }
  };

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    // Toggle off
    if (recording) {
      stopRecognition();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in your browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-CA';

    recognition.onstart = () => {
      setRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join('');
      setQuery(transcript);

      // Auto-submit when result is final
      if (event.results[0].isFinal) {
        if (transcript.trim()) {
          onQuerySubmit(transcript);
          setQuery('');
        }
        stopRecognition();
      }
    };

    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (e: any) => {
      console.error('Speech recognition error:', e.error);
      setRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [recording, stopRecognition, onQuerySubmit]);

  const handleSuggestionSelect = (text: string) => {
    setQuery(text);
    onQuerySubmit(text);
    setQuery('');
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] md:w-full max-w-[640px]">
      <div className="flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        <form 
          onSubmit={handleSubmit}
          className="flex items-center h-[56px] bg-[#050A1A]/95 backdrop-blur-[16px] border border-[#1E3050] rounded-2xl px-2 shadow-[0_-4px_32px_rgba(59,130,246,0.05)]"
          style={{ fontFamily: 'Rubik' }}
        >
          <button 
            type="button"
            onClick={handleMicClick}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
              recording 
                ? 'bg-red-500 animate-pulse text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                : 'bg-[#3B82F6] text-white hover:bg-blue-400'
            }`}
            title={recording ? 'Stop recording' : 'Start voice input'}
          >
            <Mic className="w-5 h-5" />
          </button>
          
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={recording ? 'Listening...' : 'Ask CityLens anything... (e.g., "Build a 4-storey condo on King St")'}
            className="flex-1 bg-transparent border-none text-white px-4 placeholder:text-[#64748B] focus:outline-none text-[15px]"
          />
          
          <button 
            type="submit"
            disabled={!query.trim() || submitting}
            className="w-10 h-10 rounded-full bg-[#3B82F6] text-white flex items-center justify-center hover:bg-blue-400 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
          </button>
        </form>

        <SuggestionChips onSelect={handleSuggestionSelect} />
      </div>
    </div>
  );
}
