import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Laat tekst voorlezen met de ingebouwde spraaksynthese van de browser
 * (Web Speech API). Werkt volledig op het toestel — geen server, geen netwerk.
 *
 * - `supported` is pas ná mount betrouwbaar (vermijdt SSR-mismatch).
 * - Stemmen laden asynchroon; we luisteren op `voiceschanged` en kiezen bij
 *   voorkeur een Nederlandse (liefst Belgische) stem.
 * - iOS vereist dat `speak()` binnen een gebruikersactie (tik) start.
 */
export function useSpeech(preferredLang = "nl-BE") {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const synth = window.speechSynthesis;
    const pickVoice = () => {
      const voices = synth.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang === preferredLang) ??
        voices.find((v) => v.lang.replace("_", "-").startsWith("nl")) ??
        null;
    };
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);
    return () => {
      synth.removeEventListener("voiceschanged", pickVoice);
      synth.cancel();
    };
  }, [preferredLang]);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel(); // eventuele lopende voordracht eerst stoppen
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voiceRef.current;
      u.lang = voiceRef.current?.lang ?? preferredLang;
      u.rate = 1;
      u.pitch = 1;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    },
    [preferredLang],
  );

  const toggle = useCallback(
    (text: string) => (speaking ? stop() : speak(text)),
    [speaking, speak, stop],
  );

  return { supported, speaking, speak, stop, toggle };
}
