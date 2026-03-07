import { useState, useEffect } from 'react';
import { X, Key, Settings } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [geminiKey, setGeminiKey] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGeminiKey(localStorage.getItem('gemini_api_key') || '');
      setElevenLabsKey(localStorage.getItem('elevenlabs_api_key') || '');
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('gemini_api_key', geminiKey.trim());
    localStorage.setItem('elevenlabs_api_key', elevenLabsKey.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0A1628]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#111D32] border border-[#1E3050] rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#3B82F6]" />
            Integration Settings
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1E3050] text-[#94A3B8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-[#94A3B8] mb-1.5 flex items-center gap-2">
              <Key className="w-3.5 h-3.5" /> Gemini API Key
            </label>
            <input 
              type="password"
              className="w-full bg-[#0A1628] border border-[#1E3050] rounded-lg px-4 py-2.5 text-white text-[14px] focus:outline-none focus:border-[#3B82F6] transition-colors placeholder-[#334155]"
              placeholder="AIzasY..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <p className="text-[11px] text-[#64748B] mt-1.5">
              Get an API key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-[#3B82F6] hover:underline">Google AI Studio</a>. (Required for dynamic simulations)
            </p>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#94A3B8] mb-1.5 flex items-center gap-2">
              <Key className="w-3.5 h-3.5" /> ElevenLabs Voice API Key (Optional)
            </label>
            <input 
              type="password"
              className="w-full bg-[#0A1628] border border-[#1E3050] rounded-lg px-4 py-2.5 text-white text-[14px] focus:outline-none focus:border-[#3B82F6] transition-colors placeholder-[#334155]"
              placeholder="sk_..."
              value={elevenLabsKey}
              onChange={(e) => setElevenLabsKey(e.target.value)}
            />
             <p className="text-[11px] text-[#64748B] mt-1.5">
              Used for text-to-speech narration. <a href="https://elevenlabs.io/" target="_blank" rel="noreferrer" className="text-[#3B82F6] hover:underline">ElevenLabs API</a>.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-[#94A3B8] font-medium hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-5 py-2.5 bg-[#3B82F6] hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
}
