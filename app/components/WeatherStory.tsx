"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  conditionFromCurrent,
  fetchCurrent,
  fetchDailyDetail,
  type CurrentWeather,
  type DailyDetail,
} from "../lib/weather";
import { buildWeatherStory, type WeatherStory as Story } from "../lib/weatherStory";
import { useSpeech } from "../lib/useSpeech";

/** Aantal dagen dat we ophalen voor het week-praatje. */
const DAYS = 7;

/** Symbolen omzetten zodat de spraaksynthese ze natuurlijk uitspreekt. */
function speakable(s: string): string {
  return s
    .replace(/°/g, " graden")
    .replace(/\bBft\b/g, "beaufort")
    .replace(/\bmm\b/g, "millimeter")
    .replace(/%/g, " procent");
}

/** Weerpraatje over de plaats uit de bovenbalk: vandaag + deze week. */
export function WeatherStory({
  place,
  onClose,
}: {
  place: { name: string; lat: number; lon: number };
  onClose: () => void;
}) {
  const [story, setStory] = useState<Story | null>(null);
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Op primitieve waarden afhangen (niet het `place`-object, dat elke render een
  // nieuwe identiteit krijgt) → de fetch vuurt enkel bij een échte plaatswissel.
  const { name, lat, lon } = place;
  useEffect(() => {
    let active = true;
    setStory(null);
    setError(false);
    Promise.all([
      fetchCurrent({ lat, lon }).catch(() => null),
      fetchDailyDetail({ lat, lon }, DAYS),
    ])
      .then(([cur, days]: [CurrentWeather | null, DailyDetail[]]) => {
        if (!active) return;
        setCurrent(cur);
        setStory(buildWeatherStory(name, cur, days));
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [name, lat, lon]);

  const cond = current ? conditionFromCurrent(current) : null;

  const {
    supported: canSpeak,
    speaking,
    basicVoice,
    voices,
    voiceURI,
    selectVoice,
    refreshVoices,
    toggle,
    stop,
  } = useSpeech();

  // Voordracht stoppen zodra je van plaats wisselt.
  useEffect(() => stop, [name, stop]);

  // Platform-specifiek instellingen-pad in de tip (WeatherStory rendert enkel
  // client-side, dus navigator is beschikbaar).
  const isAndroid =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  const speakText = story
    ? speakable(
        [
          `Weerpraatje voor ${place.name}.`,
          `Vandaag. ${story.today}`,
          story.week ? `Deze week. ${story.week}` : "",
          story.wind ? `Wind. ${story.wind}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      )
    : "";

  return (
    <div className="absolute inset-0 z-[1300] bg-surface flex flex-col animate-fade-in">
      {/* Kop */}
      <div className="flex items-center gap-1 px-3 h-14 shrink-0 border-b-2 border-outline-variant">
        <button
          onClick={onClose}
          aria-label="Terug naar kaart"
          className="w-10 h-10 -ml-2 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="arrow_back" className="text-[24px]" />
        </button>
        <div className="flex-grow min-w-0">
          <div className="font-label-sm text-label-sm uppercase tracking-widest text-outline leading-none">
            Weerpraatje
          </div>
          <h2 className="font-headline-md text-headline-md uppercase tracking-wide truncate leading-tight">
            {place.name}
          </h2>
        </div>
        {canSpeak && story && (
          <button
            onClick={() => toggle(speakText)}
            aria-label={speaking ? "Stoppen met voorlezen" : "Praatje voorlezen"}
            aria-pressed={speaking}
            className={`w-10 h-10 shrink-0 rounded-full border-2 flex items-center justify-center active-press ${
              speaking
                ? "bg-primary border-primary text-on-primary"
                : "border-outline-variant text-primary hover:bg-surface-container-high"
            }`}
          >
            <Icon name={speaking ? "stop" : "volume_up"} className="text-[24px]" />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="w-10 h-10 -mr-1 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="close" className="text-[24px]" />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto">
        {error ? (
          <p className="p-4 text-error font-label-lg text-label-lg flex items-center gap-2">
            <Icon name="error" filled /> Kon het weer niet laden.
          </p>
        ) : !story ? (
          <div className="flex items-center justify-center h-full gap-2 text-outline font-label-lg text-label-lg uppercase tracking-widest">
            <Icon name="progress_activity" className="animate-spin" /> Praatje
            maken…
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-5">
            {/* Vandaag */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                {cond && (
                  <Icon
                    name={cond.icon}
                    filled={cond.filled}
                    className="text-[40px] shrink-0"
                  />
                )}
                <div>
                  <h3 className="font-headline-sm text-[20px] uppercase tracking-wide text-primary leading-none">
                    Vandaag
                  </h3>
                  {current && (
                    <div className="text-[15px] text-on-surface-variant mt-1 leading-none">
                      Nu {Math.round(current.temp)}° · {cond?.label}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[16px] leading-relaxed text-on-surface">
                {story.today}
              </p>
            </section>

            {story.week && (
              <section className="pt-4 border-t-2 border-outline-variant">
                <h3 className="font-headline-sm text-[20px] uppercase tracking-wide text-primary mb-2">
                  Deze week
                </h3>
                <p className="text-[16px] leading-relaxed text-on-surface">
                  {story.week}
                </p>
              </section>
            )}

            {story.wind && (
              <section className="pt-4 border-t-2 border-outline-variant">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="air" className="text-[26px] text-primary shrink-0" />
                  <h3 className="font-headline-sm text-[20px] uppercase tracking-wide text-primary">
                    Wind
                  </h3>
                </div>
                <p className="text-[16px] leading-relaxed text-on-surface">
                  {story.wind}
                </p>
              </section>
            )}

            {canSpeak && voices.length > 0 && (
              <div className="flex items-center gap-2 text-[14px] text-on-surface-variant">
                <Icon
                  name="record_voice_over"
                  className="text-[20px] text-primary shrink-0"
                />
                <span className="shrink-0">Stem</span>
                {voices.length > 1 ? (
                  <select
                    value={voiceURI ?? ""}
                    onChange={(e) => selectVoice(e.target.value)}
                    className="min-w-0 flex-grow rounded-lg border border-outline-variant bg-surface-container-high px-2 py-1.5 text-[14px] text-on-surface focus:outline-none focus:border-primary"
                  >
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="min-w-0 flex-grow truncate">
                    {voices[0]?.name}
                  </span>
                )}
                <button
                  onClick={() => {
                    setRefreshing(true);
                    refreshVoices();
                    setTimeout(() => setRefreshing(false), 700);
                  }}
                  aria-label="Stemmen vernieuwen"
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high active-press"
                >
                  <Icon
                    name="refresh"
                    className={`text-[20px] ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            )}

            {canSpeak && (
              <p className="flex items-start gap-1.5 text-[13px] leading-snug text-on-surface-variant">
                <Icon
                  name="info"
                  className="text-[16px] text-primary shrink-0 mt-0.5"
                />
                <span>
                  {isAndroid ? (
                    <>
                      Nieuwe stem gekozen in Instellingen → Toegankelijkheid →
                      Tekst-naar-spraak-uitvoer? Tik op ↻ om ze te vernieuwen.
                    </>
                  ) : (
                    <>
                      Wijzig je de stem in Instellingen → Toegankelijkheid → Lezen
                      en spreken → Stemmen? iPhone onthoudt de lijst: tik op ↻, of
                      sluit Sunseeker volledig en open ze opnieuw om de wijziging
                      te zien.
                    </>
                  )}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
