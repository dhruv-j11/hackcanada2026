const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" - professional female voice

export async function speakNarration(text: string): Promise<void> {
  const apiKey = import.meta.env.VITE_ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    console.warn("No ElevenLabs API key found. Using mock voice. Set VITE_ELEVEN_LABS_API_KEY in .env");
    return new Promise(resolve => setTimeout(resolve, 2000));
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) throw new Error("TTS Failed");

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    return new Promise((resolve) => {
      audio.onended = () => resolve();
      audio.play().catch(e => {
        console.error("Audio playback prevented:", e);
        resolve();
      });
    });
  } catch (err) {
    console.error("ElevenLabs TTS error:", err);
  }
}

export function startVoiceInput(onResult: (text: string) => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("Speech Recognition API not supported in this browser.");
    alert("Speech recognition not supported in your browser.");
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-CA';
  recognition.interimResults = false;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };
  
  recognition.start();
}
