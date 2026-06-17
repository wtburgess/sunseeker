"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "./components/Icon";
import { TopAppBar } from "./components/TopAppBar";
import { geocode } from "./lib/geo";
import {
  conditionFromCode,
  planTrip,
  type DayForecast,
  type Preferences,
  type ScoredCity,
} from "./lib/weather";

const ResultsMap = dynamic(() => import("./components/ResultsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] flex items-center justify-center text-outline font-label-lg text-label-lg uppercase tracking-widest">
      Kaart laden…
    </div>
  ),
});

type View = "input" | "results";
type OriginCoords = { lat: number; lon: number };

export default function Home() {
  const [view, setView] = useState<View>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScoredCity[]>([]);
  const [resolvedOrigin, setResolvedOrigin] = useState("");
  const [originCoords, setOriginCoords] = useState<OriginCoords | null>(null);

  const [origin, setOrigin] = useState("");
  const [tripDays, setTripDays] = useState<number>(7);
  const [customDays, setCustomDays] = useState(false);
  const [minTemp, setMinTemp] = useState(22);
  const [maxTemp, setMaxTemp] = useState(40);
  const [maxDistance, setMaxDistance] = useState(1000);
  const [wantSun, setWantSun] = useState(true);
  const [wantDry, setWantDry] = useState(true);
  const [wantSnow, setWantSnow] = useState(false);

  async function handleSearch() {
    if (!origin.trim()) {
      setError("Vul eerst je vertrekpunt in.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const place = await geocode(origin.trim());
      if (!place) {
        setError(`We vonden geen plaats voor “${origin}”. Probeer een stad.`);
        return;
      }
      const prefs: Preferences = {
        minTemp,
        maxTemp,
        wantSun,
        wantDry,
        wantSnow,
        tripDays,
        maxDistanceKm: maxDistance,
      };
      const ranked = await planTrip(place, prefs);
      setResults(ranked);
      setResolvedOrigin(`${place.name}, ${place.country}`);
      setOriginCoords({ lat: place.lat, lon: place.lon });
      setView("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kon het weer niet ophalen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopAppBar />
      {view === "input" ? (
        <InputScreen
          origin={origin}
          setOrigin={setOrigin}
          tripDays={tripDays}
          setTripDays={setTripDays}
          customDays={customDays}
          setCustomDays={setCustomDays}
          minTemp={minTemp}
          setMinTemp={setMinTemp}
          maxTemp={maxTemp}
          setMaxTemp={setMaxTemp}
          maxDistance={maxDistance}
          setMaxDistance={setMaxDistance}
          wantSun={wantSun}
          setWantSun={setWantSun}
          wantDry={wantDry}
          setWantDry={setWantDry}
          wantSnow={wantSnow}
          setWantSnow={setWantSnow}
          loading={loading}
          error={error}
          onSearch={handleSearch}
        />
      ) : (
        <ResultsScreen
          results={results}
          origin={resolvedOrigin}
          originCoords={originCoords}
          tripDays={tripDays}
          minTemp={minTemp}
          maxTemp={maxTemp}
          wantSun={wantSun}
          wantDry={wantDry}
          wantSnow={wantSnow}
          maxDistance={maxDistance}
          onBack={() => setView("input")}
        />
      )}
    </div>
  );
}

/* ── Inputscherm ───────────────────────────────────────────────────────── */
type InputProps = {
  origin: string;
  setOrigin: (v: string) => void;
  tripDays: number;
  setTripDays: (v: number) => void;
  customDays: boolean;
  setCustomDays: (v: boolean) => void;
  minTemp: number;
  setMinTemp: (v: number) => void;
  maxTemp: number;
  setMaxTemp: (v: number) => void;
  maxDistance: number;
  setMaxDistance: (v: number) => void;
  wantSun: boolean;
  setWantSun: (v: boolean) => void;
  wantDry: boolean;
  setWantDry: (v: boolean) => void;
  wantSnow: boolean;
  setWantSnow: (v: boolean) => void;
  loading: boolean;
  error: string | null;
  onSearch: () => void;
};

function InputScreen(p: InputProps) {
  return (
    <>
      <main className="flex-grow pt-md pb-40 px-4 md:px-container-margin max-w-2xl w-full mx-auto space-y-md animate-fade-in">
        {/* Vertrekpunt */}
        <section className="space-y-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface-variant flex items-center gap-2">
            <Icon name="near_me" />
            Waar vertrek je?
          </h2>
          <div className="expedition-card stamp-shadow p-sm rounded-lg flex items-center gap-3">
            <Icon name="location_on" className="text-primary" />
            <input
              value={p.origin}
              onChange={(e) => p.setOrigin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && p.onSearch()}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none font-body-lg text-body-lg placeholder:text-outline/50"
              placeholder="Bv. Brussel, Antwerpen, Amsterdam…"
              type="text"
            />
          </div>
        </section>

        {/* Duur + min. temperatuur */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <section className="expedition-card stamp-shadow p-md rounded-lg space-y-sm">
            <div className="flex justify-between items-baseline">
              <h3 className="font-label-lg text-label-lg uppercase tracking-widest text-outline">
                Duur van de reis
              </h3>
              {p.customDays && (
                <span className="font-headline-sm text-headline-sm text-primary">
                  {p.tripDays} dagen
                </span>
              )}
            </div>
            <div className="flex p-xs bg-surface-container-high rounded-sm gap-1">
              {[
                {
                  key: "7",
                  label: "7d",
                  active: !p.customDays && p.tripDays === 7,
                  on: () => {
                    p.setCustomDays(false);
                    p.setTripDays(7);
                  },
                },
                {
                  key: "14",
                  label: "14d",
                  active: !p.customDays && p.tripDays === 14,
                  on: () => {
                    p.setCustomDays(false);
                    p.setTripDays(14);
                  },
                },
                {
                  key: "andere",
                  label: "Andere",
                  active: p.customDays,
                  on: () => {
                    p.setCustomDays(true);
                    if (p.tripDays === 7 || p.tripDays === 14) p.setTripDays(10);
                  },
                },
              ].map((b) => (
                <button
                  key={b.key}
                  onClick={b.on}
                  className={`flex-1 py-base font-headline-sm text-headline-sm uppercase tracking-tighter transition-all duration-200 rounded-sm ${
                    b.active
                      ? "bg-primary text-on-primary -rotate-1"
                      : "text-on-surface-variant/60"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {p.customDays && (
              <input
                type="range"
                min={3}
                max={16}
                value={p.tripDays}
                onChange={(e) => p.setTripDays(Number(e.target.value))}
              />
            )}
          </section>

          <section className="expedition-card stamp-shadow p-md rounded-lg space-y-sm">
            <div className="flex justify-between items-baseline">
              <h3 className="font-label-lg text-label-lg uppercase tracking-widest text-outline">
                Temperatuur
              </h3>
              <span className="font-headline-sm text-headline-sm text-primary">
                {p.minTemp}° – {p.maxTemp >= 40 ? "40°+" : `${p.maxTemp}°`}
              </span>
            </div>
            <TempRange
              min={-10}
              max={40}
              minValue={p.minTemp}
              maxValue={p.maxTemp}
              onMinChange={p.setMinTemp}
              onMaxChange={p.setMaxTemp}
            />
            <div className="flex justify-between text-[10px] uppercase font-bold text-outline/40 tracking-widest">
              <span>Vriezend</span>
              <span>Tropisch</span>
            </div>
          </section>
        </div>

        {/* Afstand */}
        <section className="expedition-card stamp-shadow p-md rounded-lg space-y-sm">
          <div className="flex justify-between items-baseline">
            <h3 className="font-label-lg text-label-lg uppercase tracking-widest text-outline">
              Max. afstand van hier
            </h3>
            <span className="font-headline-sm text-headline-sm text-primary">
              {p.maxDistance} km
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={2500}
            step={50}
            value={p.maxDistance}
            onChange={(e) => p.setMaxDistance(Number(e.target.value))}
          />
          <div className="flex justify-between text-[10px] uppercase font-bold text-outline/40 tracking-widest">
            <span>Dichtbij</span>
            <span>Expeditie</span>
          </div>
        </section>

        {/* Weersvoorkeuren */}
        <section className="expedition-card stamp-shadow p-md rounded-lg space-y-md">
          <div className="flex items-center gap-2 border-b border-outline-variant pb-sm">
            <Icon name="wb_sunny" className="text-secondary" filled />
            <h2 className="font-headline-md text-headline-md">
              Wat is goed weer voor jou?
            </h2>
          </div>
          <div className="flex flex-wrap gap-sm">
            <PrefChip
              label="Zonnig"
              icon="sunny"
              active={p.wantSun}
              onClick={() => p.setWantSun(!p.wantSun)}
            />
            <PrefChip
              label="Droog"
              icon="water_drop"
              active={p.wantDry}
              onClick={() => p.setWantDry(!p.wantDry)}
            />
            <PrefChip
              label="Sneeuw"
              icon="weather_snowy"
              active={p.wantSnow}
              onClick={() => p.setWantSnow(!p.wantSnow)}
            />
          </div>
          <p className="font-label-sm text-label-sm text-outline">
            Deze keuzes bepalen mee hoe we elke bestemming scoren.
          </p>
        </section>

        {p.error && (
          <p className="text-error font-label-lg text-label-lg flex items-center gap-2">
            <Icon name="error" filled /> {p.error}
          </p>
        )}
      </main>

      {/* Actieknop */}
      <footer className="fixed bottom-0 left-0 w-full p-4 md:p-container-margin z-50 bg-linear-to-t from-background via-background to-transparent">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={p.onSearch}
            disabled={p.loading}
            className="w-full bg-primary text-on-primary py-md rounded-xl font-headline-md text-headline-md uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ clipPath: "polygon(0% 5%, 100% 0%, 98% 95%, 2% 100%)" }}
          >
            <Icon
              name={p.loading ? "progress_activity" : "filter_drama"}
              className={p.loading ? "animate-spin" : "animate-float"}
            />
            {p.loading ? "Weer zoeken…" : "Toon goed weer"}
          </button>
        </div>
      </footer>
    </>
  );
}

function PrefChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-md py-sm rounded-full border transition-all ${
        active
          ? "bg-secondary-container border-secondary text-on-secondary-container animate-pop -rotate-2"
          : "bg-surface-container-high border-outline-variant hover:border-primary"
      }`}
    >
      <Icon name={icon} filled={active} />
      <span className="font-label-lg text-label-lg uppercase">{label}</span>
    </button>
  );
}

/* Dubbele slider met een min- en max-bolletje (min links, max rechts). */
function TempRange({
  min,
  max,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
}) {
  const GAP = 1; // minimale afstand tussen min en max in °C
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="dual-range">
      {/* Passieve achtergrondbalk + actieve band tussen de twee bolletjes */}
      <div className="dual-range__track" />
      <div
        className="dual-range__fill"
        style={{ left: `${pct(minValue)}%`, right: `${100 - pct(maxValue)}%` }}
      />
      {/* Min-bolletje (links) */}
      <input
        type="range"
        min={min}
        max={max}
        value={minValue}
        aria-label="Minimumtemperatuur"
        onChange={(e) =>
          onMinChange(Math.min(Number(e.target.value), maxValue - GAP))
        }
      />
      {/* Max-bolletje (rechts, schuift naar links) */}
      <input
        type="range"
        min={min}
        max={max}
        value={maxValue}
        aria-label="Maximumtemperatuur"
        onChange={(e) =>
          onMaxChange(Math.max(Number(e.target.value), minValue + GAP))
        }
      />
    </div>
  );
}

/* ── Resultatenscherm ──────────────────────────────────────────────────── */
function ResultsScreen({
  results,
  origin,
  originCoords,
  tripDays,
  minTemp,
  maxTemp,
  wantSun,
  wantDry,
  wantSnow,
  maxDistance,
  onBack,
}: {
  results: ScoredCity[];
  origin: string;
  originCoords: OriginCoords | null;
  tripDays: number;
  minTemp: number;
  maxTemp: number;
  wantSun: boolean;
  wantDry: boolean;
  wantSnow: boolean;
  maxDistance: number;
  onBack: () => void;
}) {
  const top = results.slice(0, 20);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [resultView, setResultView] = useState<"list" | "map">("list");

  return (
    <main className="flex-grow pt-md pb-24 px-4 md:px-container-margin max-w-2xl w-full mx-auto space-y-md animate-fade-in">
      <div className="flex justify-between items-end border-b-2 border-primary-container/20 pb-base">
        <div>
          <h2 className="font-headline-md text-headline-md uppercase tracking-tight flex items-center gap-1">
            Beste matches
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Hoe wordt de score berekend?"
              className={`active-press transition-colors ${
                showInfo ? "text-primary" : "text-outline hover:text-primary"
              }`}
            >
              <Icon name="info" filled={showInfo} className="text-[20px]" />
            </button>
          </h2>
          <p className="font-label-lg text-label-lg text-on-surface-variant flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="flex items-center gap-1">
              <Icon name="near_me" className="text-[16px]" /> {origin}
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <Icon name="event" className="text-[16px]" /> {tripDays}d
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <Icon name="explore" className="text-[16px]" /> ≤{maxDistance} km
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <Icon name="thermostat" className="text-[16px]" /> {minTemp}°–
              {maxTemp >= 40 ? "40°+" : `${maxTemp}°`}
            </span>
            {wantSun && (
              <span className="flex items-center gap-1">
                <Icon name="sunny" className="text-[16px]" />
              </span>
            )}
            {wantDry && (
              <span className="flex items-center gap-1">
                <Icon name="water_drop" className="text-[16px]" />
              </span>
            )}
            {wantSnow && (
              <span className="flex items-center gap-1">
                <Icon name="weather_snowy" className="text-[16px]" />
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-sm py-base rounded-full border-2 border-primary text-primary font-label-lg text-label-lg uppercase font-bold active-press flex-shrink-0 hover:bg-primary hover:text-on-primary transition-colors"
        >
          <Icon name="tune" className="text-[20px]" /> Wijzig
        </button>
      </div>

      {/* Lijst / Kaart-toggle */}
      {top.length > 0 && (
        <div className="flex p-xs bg-surface-container-high rounded-sm">
          {(
            [
              ["list", "Lijst", "format_list_bulleted"],
              ["map", "Kaart", "map"],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setResultView(key)}
              className={`flex-1 flex items-center justify-center gap-1 py-base font-label-lg text-label-lg uppercase tracking-widest transition-all duration-200 rounded-sm ${
                resultView === key
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant/60"
              }`}
            >
              <Icon name={icon} className="text-[18px]" /> {label}
            </button>
          ))}
        </div>
      )}

      {showInfo && (
        <ScoreInfo wantSun={wantSun} wantDry={wantDry} wantSnow={wantSnow} />
      )}

      {top.length === 0 ? (
        <div className="text-center py-lg space-y-2 text-on-surface-variant">
          <Icon name="travel_explore" className="text-[40px] text-outline" />
          <p className="font-headline-sm text-headline-sm uppercase">
            Geen bestemmingen in bereik
          </p>
          <p className="font-body-md text-sm">
            Verhoog de maximale afstand en probeer opnieuw.
          </p>
        </div>
      ) : resultView === "map" && originCoords ? (
        <ResultsMap
          results={results}
          origin={{ ...originCoords, label: origin }}
        />
      ) : (
        <div className="space-y-gutter">
          {top.map((r, i) => (
            <ResultCard
              key={r.city.id}
              result={r}
              rank={i + 1}
              expanded={openId === r.city.id}
              onToggle={() =>
                setOpenId((cur) => (cur === r.city.id ? null : r.city.id))
              }
            />
          ))}
        </div>
      )}

      <p className="text-center font-label-sm text-label-sm text-outline pt-base flex items-center justify-center gap-1">
        <Icon name="bolt" className="text-[14px]" /> Live forecast via Open-Meteo
      </p>
    </main>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
  });

function scoreBadge(score: number) {
  if (score >= 9)
    return "bg-secondary-fixed-dim text-on-secondary-container border-secondary"; // heel fel
  if (score >= 8)
    return "bg-secondary-container text-on-secondary-container border-secondary"; // fel
  if (score >= 7)
    return "bg-secondary-fixed text-on-secondary-container border-secondary/50"; // zachter
  return "bg-surface-variant text-on-surface-variant border-outline"; // grijs
}

function ScoreInfo({
  wantSun,
  wantDry,
  wantSnow,
}: {
  wantSun: boolean;
  wantDry: boolean;
  wantSnow: boolean;
}) {
  return (
    <div className="border-2 border-dashed border-outline-variant bg-surface-container-highest rounded-lg p-md space-y-sm animate-fade-in">
      <h4 className="font-headline-sm text-headline-sm uppercase text-primary flex items-center gap-2">
        <Icon name="calculate" /> Hoe de score werkt
      </h4>
      <p className="font-body-md text-sm text-on-surface-variant">
        Elke dag krijgt een cijfer van 0 tot 10. De eindscore is het{" "}
        <strong>gemiddelde over alle dagen</strong> van je reis — hoe meer goede
        dagen, hoe hoger (ook met een regendag ertussen).
      </p>
      <ul className="space-y-2 font-body-md text-sm">
        <li className="flex gap-2">
          <Icon name="water_drop" className="text-tertiary text-sm" />
          <span>
            <strong>Droog</strong> — neerslag en regenkans drukken de score.
            Weegt het zwaarst{wantDry ? " (en extra, want je koos “droog”)" : ""}.
          </span>
        </li>
        <li className="flex gap-2">
          <Icon name="thermostat" className="text-primary text-sm" />
          <span>
            <strong>Temperatuur</strong> — binnen jouw min–max band; te koud of
            te warm drukt de score. Weegt mee, maar net iets minder dan droogte.
          </span>
        </li>
        <li className="flex gap-2">
          <Icon name="sunny" className="text-secondary text-sm" filled />
          <span>
            <strong>Zon</strong> — minder bewolking = hoger
            {wantSun ? " (zwaarder, want je koos “zonnig”)" : ""}.
          </span>
        </li>
        {wantSnow && (
          <li className="flex gap-2">
            <Icon name="weather_snowy" className="text-tertiary text-sm" />
            <span>
              <strong>Sneeuw</strong> — sneeuwval en koude met neerslag scoren
              hoog (zwaarder, want je koos “sneeuw”).
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function ResultCard({
  result,
  rank,
  expanded,
  onToggle,
}: {
  result: ScoredCity;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { city, distanceKm, score, condition } = result;
  const badgeCls = scoreBadge(score);

  return (
    <article
      className="bg-surface border border-outline-variant rounded-xl stamp-shadow overflow-hidden animate-stamp-in transition-transform duration-200 md:hover:-translate-y-0.5 md:hover:rotate-[-0.6deg]"
      style={{ animationDelay: `${Math.min(rank - 1, 12) * 40}ms` }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left flex gap-3 md:gap-md items-start p-3 md:p-md hover:bg-surface-container-high/50 transition-colors"
      >
        {/* Weerpatch + rang */}
        <div className="flex-shrink-0">
          <div
            className={`relative w-14 h-14 rounded-full stamped-badge border-2 flex items-center justify-center ${condition.patch}`}
          >
            <Icon
              name={condition.icon}
              filled={condition.filled}
              className="text-[28px]"
            />
            <span
              className={`absolute -top-1 -left-1 w-6 h-6 bg-primary text-on-primary rounded-full flex items-center justify-center font-headline-sm text-label-sm border-2 border-surface ${
                rank === 1 ? "animate-wiggle" : ""
              }`}
            >
              {rank}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-grow min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h3 className="font-headline-sm text-headline-sm uppercase leading-tight">
                {city.name}
              </h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
                {city.country} · {distanceKm} km
              </span>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="font-headline-md text-headline-md text-primary">
                {result.avgTempMax}°
              </span>
              <span className="block text-xs uppercase font-label-sm opacity-60">
                {condition.label}
              </span>
            </div>
          </div>

          <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <Icon name="event_available" className="text-sm" filled />
            {result.goodDays}/{result.totalDays} goede dagen ·{" "}
            {fmtDate(result.startDate)} – {fmtDate(result.endDate)}
          </p>

          <div className="mt-base flex items-center justify-between border-t border-outline-variant pt-base font-label-sm text-label-sm text-on-surface-variant">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Icon name="cloud" className="text-sm" /> {result.avgCloud}%
              </span>
              <span className="flex items-center gap-1">
                <Icon name="rainy" className="text-sm" /> {result.totalPrecip} mm
              </span>
            </div>
            <span className="flex items-center gap-1 text-primary uppercase font-bold">
              Per dag
              <Icon
                name="expand_more"
                className={`text-sm transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </span>
          </div>
        </div>

        {/* Score */}
        <div
          className={`flex-shrink-0 self-stretch w-14 md:w-16 rounded-lg border-2 flex flex-col items-center justify-center ${badgeCls} ${
          rank === 1 ? "animate-pulse-glow" : ""
        }`}
        >
          <span className="font-headline-md text-headline-md leading-none">
            {score.toFixed(1)}
          </span>
          <span className="font-label-sm text-[10px] uppercase tracking-widest">
            Score
          </span>
        </div>
      </button>

      {expanded && <DayDetail days={result.days} />}
    </article>
  );
}

function DayDetail({ days }: { days: DayForecast[] }) {
  return (
    <div className="border-t-2 border-dashed border-outline-variant bg-surface-container-low px-3 md:px-md py-base animate-fade-in">
      <div className="flex flex-col">
        {days.map((day) => (
          <DayRow key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}

function DayRow({ day }: { day: DayForecast }) {
  const cond = conditionFromCode(day.code);
  return (
    <div
      className={`flex items-center gap-2 py-sm border-l-4 pl-2 ${
        day.good
          ? "border-secondary bg-secondary-container/15"
          : "border-transparent opacity-70"
      }`}
    >
      <div className="w-12 flex-shrink-0">
        <div className="font-label-sm text-label-sm uppercase tracking-wide">
          {fmtWeekday(day.date)}
        </div>
        <div className="text-[10px] text-on-surface-variant">
          {fmtDate(day.date)}
        </div>
      </div>
      <Icon
        name={cond.icon}
        filled={cond.filled}
        className={`text-[22px] flex-shrink-0 ${cond.iconColor}`}
      />
      <span className="font-headline-sm text-headline-sm w-9 flex-shrink-0">
        {Math.round(day.tMax)}°
      </span>
      <div className="flex-grow flex items-center gap-2 text-xs text-on-surface-variant min-w-0">
        <span className="flex items-center gap-0.5">
          <Icon name="cloud" className="text-sm" />
          {Math.round(day.cloud)}%
        </span>
        <span className="flex items-center gap-0.5">
          <Icon name="rainy" className="text-sm" />
          {day.precip}mm
        </span>
      </div>
      <span className="w-8 text-right font-headline-sm text-headline-sm text-primary flex-shrink-0">
        {day.score.toFixed(1)}
      </span>
    </div>
  );
}

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "short" });
