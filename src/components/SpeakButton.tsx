import { useEffect, useState } from 'react';

// Best available voice for a BCP-47 tag: exact match, else same language prefix.
function findVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.split('-')[0].toLowerCase();
  return voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix)) ?? null;
}

/**
 * Speaker icon that pronounces `text` in language `lang` via the Web Speech
 * API. Renders nothing when the browser has no voice for that language, so
 * users never hear an anglicized mangling of an endonym.
 */
export default function SpeakButton({ text, lang }: { text: string; lang: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const check = () => setAvailable(!!findVoice(lang));
    check(); // voices may already be loaded
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check);
  }, [lang]);

  if (!available) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel(); // stop any previous utterance
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = findVoice(lang);
    if (voice) u.voice = voice;
    u.rate = 0.9;
    synth.speak(u);
  };

  return (
    <button
      className="speak-button"
      onClick={(e) => { e.stopPropagation(); speak(); }}
      title={`Pronounce “${text}”`}
      aria-label={`Pronounce ${text}`}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z" />
        <path d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
      </svg>
    </button>
  );
}
