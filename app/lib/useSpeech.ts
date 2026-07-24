import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "weerpraatje-stem"; // onthoudt de gekozen stem (voiceURI)

/**
 * Kwaliteitsscore voor een stem: hoe natuurlijker (Siri/premium/enhanced),
 * hoe hoger. Op iOS zijn de standaardstemmen "compact"; heeft de gebruiker een
 * betere Nederlandse stem gedownload (Instellingen → Toegankelijkheid →
 * Gesproken materiaal → Stemmen), dan verkiezen we die automatisch.
 */
function voiceScore(v: SpeechSynthesisVoice): number {
  const id = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (id.includes("siri")) s += 5;
  if (id.includes("premium") || id.includes("neural")) s += 4;
  if (id.includes("enhanced") || id.includes("verbeterd")) s += 3;
  if (id.includes("compact")) s -= 2;
  if (v.lang === "nl-BE") s += 1; // lichte voorkeur voor Belgisch-Nederlands
  return s;
}

/**
 * Laat tekst voorlezen met de ingebouwde spraaksynthese van de browser
 * (Web Speech API). Werkt volledig op het toestel — geen server, geen netwerk.
 *
 * - `supported` is pas ná mount betrouwbaar (vermijdt SSR-mismatch).
 * - `voices` zijn de beschikbare Nederlandse stemmen; met `selectVoice` kiest de
 *   gebruiker er zelf één (onthouden in localStorage). Zonder keuze pakken we
 *   automatisch de natuurlijkst klinkende (zie `voiceScore`).
 * - Stemmen laden asynchroon en iOS cachet de lijst; we her-inventariseren ook
 *   wanneer de app opnieuw zichtbaar wordt (na een download in Instellingen).
 * - iOS vereist dat `speak()` binnen een gebruikersactie (tik) start.
 */
export function useSpeech(preferredLang = "nl-BE") {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [basicVoice, setBasicVoice] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Voorkeur die de gebruiker eerder koos (blijft leidend zolang die stem bestaat).
  const chosenRef = useRef<string | null>(null);

  /** (Her)inventariseer de Nederlandse stemmen en bepaal de actieve stem. */
  const refreshVoices = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const dutch = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("nl"))
      .sort((a, b) => voiceScore(b) - voiceScore(a));
    setVoices(dutch);

    // Gekozen stem behouden indien nog beschikbaar; anders de beste.
    const picked =
      dutch.find((v) => v.voiceURI === chosenRef.current) ?? dutch[0] ?? null;
    voiceRef.current = picked;
    setVoiceURI(picked?.voiceURI ?? null);
    setBasicVoice(
      !!picked && /compact/i.test(`${picked.name} ${picked.voiceURI}`),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    chosenRef.current = window.localStorage.getItem(STORAGE_KEY);

    const synth = window.speechSynthesis;
    refreshVoices();
    synth.addEventListener("voiceschanged", refreshVoices);
    document.addEventListener("visibilitychange", refreshVoices);
    return () => {
      synth.removeEventListener("voiceschanged", refreshVoices);
      document.removeEventListener("visibilitychange", refreshVoices);
      synth.cancel();
    };
  }, [refreshVoices]);

  /** Kies expliciet een stem; wordt onthouden voor de volgende keer. */
  const selectVoice = useCallback((uri: string) => {
    const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === uri);
    if (!v) return;
    chosenRef.current = uri;
    window.localStorage.setItem(STORAGE_KEY, uri);
    voiceRef.current = v;
    setVoiceURI(uri);
    setBasicVoice(/compact/i.test(`${v.name} ${v.voiceURI}`));
  }, []);

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

      // In zinnen opdelen: Chrome (Android én desktop) kapt één lange voordracht
      // na ~15 s af. Korte stukjes na elkaar in de wachtrij omzeilen dat.
      const chunks = (text.match(/[^.!?]+[.!?]*/g) ?? [text])
        .map((c) => c.trim())
        .filter(Boolean);
      if (chunks.length === 0) return;

      const lang = voiceRef.current?.lang ?? preferredLang;
      setSpeaking(true);
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.voice = voiceRef.current;
        u.lang = lang;
        u.rate = 1; // normale snelheid
        u.pitch = 1.15; // 15% hoger
        u.onerror = () => setSpeaking(false);
        if (i === chunks.length - 1) u.onend = () => setSpeaking(false);
        synth.speak(u);
      });
    },
    [preferredLang],
  );

  const toggle = useCallback(
    (text: string) => (speaking ? stop() : speak(text)),
    [speaking, speak, stop],
  );

  return {
    supported,
    speaking,
    basicVoice,
    voices,
    voiceURI,
    selectVoice,
    refreshVoices,
    speak,
    stop,
    toggle,
  };
}
