"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Icon } from "./Icon";
import { DayDetail } from "./DayDetail";
import { ScoreInfo } from "./ScoreInfo";
import {
  conditionFromDay,
  scoreCities,
  type Preferences,
  type ScoredCity,
} from "../lib/weather";
import { type City } from "../lib/cities";
import { distanceKm } from "../lib/geo";
import { weatherGlyphSvg } from "../lib/weatherGlyphs";

type Props = {
  results: ScoredCity[];
  origin: { lat: number; lon: number; label: string };
  prefs: Preferences;
  minScore: number;
};

/** Vanaf dit zoomniveau tonen markers ook het weericoon (anders enkel het cijfer). */
const ZOOM_FULL = 5;

/** Alpha-suffix (8-cijferig hex) voor de badge-achtergrond, zodat de plaatsnaam
 *  op de kaart eronder doorschemert. Tekst en rand blijven vol. */
const BADGE_BG_ALPHA = "B3"; // ~70%

/** Kleur (hex) van de score-badge — spiegelt de lijstweergave. */
function scoreHex(score: number) {
  if (score >= 9) return { bg: "#fbbb4c", fg: "#5a3d00", bd: "#7f5700" }; // heel fel
  if (score >= 8) return { bg: "#febe4e", fg: "#724d00", bd: "#7f5700" }; // fel
  if (score >= 7) return { bg: "#ffdead", fg: "#724d00", bd: "#c79a4a" }; // zachter
  return { bg: "#e0d9cc", fg: "#56423d", bd: "#8a726b" }; // grijs
}

/** Volledige badge: score + weericoon, gestapeld in een rond bolletje. */
function badgeIconFull(score: number, iconName: string) {
  const { bg, fg, bd } = scoreHex(score);
  // Eigen weer-glyph als SVG, anders het Material Symbols-lettertype.
  const iconHtml =
    weatherGlyphSvg(iconName, 16, fg) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:14px;
      font-variation-settings:'FILL' 1;line-height:1">${iconName}</span>`;
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;border-radius:50%;display:flex;
      flex-direction:column;align-items:center;justify-content:center;gap:1px;background:${bg}${BADGE_BG_ALPHA};
      color:${fg};border:2px solid ${bd};box-shadow:0 1px 4px rgba(0,0,0,.35);
      font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:14px;line-height:1">
      <span>${score.toFixed(1)}</span>${iconHtml}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Minimalistische badge: enkel de score in een klein bolletje. */
function badgeIconMini(score: number) {
  const { bg, fg, bd } = scoreHex(score);
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;border-radius:50%;display:flex;
      align-items:center;justify-content:center;background:${bg}${BADGE_BG_ALPHA};color:${fg};
      border:1px solid ${bd};box-shadow:0 1px 2px rgba(0,0,0,.25);
      font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:11px;
      line-height:1">${score.toFixed(1)}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const originIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#9d3d22;
    border:3px solid #fff9ee;box-shadow:0 1px 5px rgba(0,0,0,.4);display:flex;
    align-items:center;justify-content:center;color:#fff;font-size:16px;
    font-family:'Material Symbols Outlined'">explore</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Zoomt op alle punten zodra de kaart geladen is. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Houdt het huidige zoomniveau bij in state. */
function ZoomWatcher({ setZoom }: { setZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  useEffect(() => {
    setZoom(map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Inwoner-drempel per zoomniveau: hoe dieper ingezoomd, hoe kleiner de
 *  plaatsen die mogen verschijnen. null = te ver uitgezoomd (geen extra's). */
function minPopForZoom(z: number): number | null {
  if (z >= 11) return 15000;
  if (z >= 10) return 30000;
  if (z >= 9) return 50000;
  if (z >= 8) return 100000;
  if (z >= 7) return 200000;
  return null;
}

/**
 * Laadt bij het inzoomen/pannen kleinere plaatsen bij die binnen het kaartbeeld
 * én binnen de gekozen afstand vallen, scoort ze en geeft ze terug. Reeds
 * geladen plaatsen worden gecachet zodat terugpannen niets opnieuw ophaalt.
 */
function ProgressiveLoader({
  origin,
  prefs,
  baseIds,
  onLoaded,
  onLoadingChange,
}: {
  origin: { lat: number; lon: number };
  prefs: Preferences;
  baseIds: Set<string>;
  onLoaded: (scored: ScoredCity[]) => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const map = useMap();
  const fetchedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Nieuwe basisset → cache leeglopen.
  useEffect(() => {
    fetchedRef.current = new Set();
  }, [baseIds]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useMapEvents({
    moveend: () => schedule(),
    zoomend: () => schedule(),
  });

  function schedule() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, 350);
  }

  async function load() {
    const minPop = minPopForZoom(map.getZoom());
    if (minPop === null) return;

    const b = map.getBounds();
    const params = new URLSearchParams({
      minLat: String(b.getSouth()),
      maxLat: String(b.getNorth()),
      minLon: String(b.getWest()),
      maxLon: String(b.getEast()),
      minPop: String(minPop),
      limit: "80",
    });

    onLoadingChange(true);
    try {
      const res = await fetch(`/api/cities?${params.toString()}`);
      if (!res.ok) return;
      const cities: City[] = await res.json();
      const fresh = cities.filter(
        (c) =>
          !baseIds.has(c.id) &&
          !fetchedRef.current.has(c.id) &&
          distanceKm(origin, c) <= prefs.maxDistanceKm,
      );
      if (fresh.length === 0) return;
      // Markeer vóór het scoren, zodat een tweede event ze niet dubbel ophaalt.
      fresh.forEach((c) => fetchedRef.current.add(c.id));
      onLoaded(await scoreCities(fresh, origin, prefs));
    } catch {
      // Bijladen is optioneel; stil falen.
    } finally {
      onLoadingChange(false);
    }
  }

  return null;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

export default function ResultsMap({
  results,
  origin,
  prefs,
  minScore,
}: Props) {
  const dayCount = results[0]?.days.length ?? 0;
  // -1 = gemiddeld over de hele reis, anders een specifieke dag-index.
  const [dayIdx, setDayIdx] = useState(-1);
  const [zoom, setZoom] = useState(5);
  // Aangeklikte bestemming → modale overlay over de kaart.
  const [selected, setSelected] = useState<ScoredCity | null>(null);
  // Bij het inzoomen bijgeladen kleinere plaatsen.
  const [extra, setExtra] = useState<ScoredCity[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const baseIds = useMemo(
    () => new Set(results.map((r) => r.city.id)),
    [results],
  );
  const allResults = useMemo(() => [...results, ...extra], [results, extra]);

  // Nieuwe zoekopdracht (andere basisset) → bijgeladen plaatsen vergeten.
  useEffect(() => setExtra([]), [results]);

  const handleLoaded = useCallback(
    (scored: ScoredCity[]) => {
      setExtra((prev) => {
        const have = new Set([...baseIds, ...prev.map((r) => r.city.id)]);
        const add = scored.filter(
          (r) => r.score >= minScore && !have.has(r.city.id),
        );
        return add.length ? [...prev, ...add] : prev;
      });
    },
    [baseIds, minScore],
  );

  const points: [number, number][] = [
    [origin.lat, origin.lon],
    ...results.map((r) => [r.city.lat, r.city.lon] as [number, number]),
  ];

  const dayLabel =
    dayIdx === -1
      ? "Gemiddeld · hele reis"
      : fmtDay(results[0].days[dayIdx].date);

  return (
    <div className="flex flex-col gap-sm">
      {/* Tijdslider */}
      <div className="expedition-card stamp-shadow rounded-lg p-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline flex items-center gap-1">
            <Icon name="schedule" className="text-[16px]" /> Tijdlijn
          </span>
          <span className="font-headline-sm text-headline-sm text-primary capitalize">
            {dayLabel}
          </span>
        </div>
        <input
          type="range"
          min={-1}
          max={dayCount - 1}
          step={1}
          value={dayIdx}
          onChange={(e) => setDayIdx(Number(e.target.value))}
        />
        <div className="flex justify-between text-[10px] uppercase font-bold text-outline/40 tracking-widest">
          <span>Gem.</span>
          <span>Dag {dayCount}</span>
        </div>
      </div>

      {/* Kaart */}
      <div className="relative h-[70vh] rounded-xl overflow-hidden border-2 border-outline-variant stamp-shadow">
        <MapContainer
          center={[origin.lat, origin.lon]}
          zoom={5}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />
          <FitBounds points={points} />
          <ZoomWatcher setZoom={setZoom} />
          <ProgressiveLoader
            origin={origin}
            prefs={prefs}
            baseIds={baseIds}
            onLoaded={handleLoaded}
            onLoadingChange={setLoadingExtra}
          />

          <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
            <Popup>
              <strong>{origin.label}</strong>
              <br />
              Je vertrekpunt
            </Popup>
          </Marker>

          {allResults.map((r) => {
            const day = dayIdx === -1 ? null : r.days[dayIdx];
            const score = day ? day.score : r.score;
            const cond = day ? conditionFromDay(day) : r.condition;
            // Uitgezoomd: enkel cijfer + kleur. Ingezoomd: weericoon erbij.
            const full = zoom >= ZOOM_FULL;
            return (
              <Marker
                key={r.city.id}
                position={[r.city.lat, r.city.lon]}
                icon={full ? badgeIconFull(score, cond.icon) : badgeIconMini(score)}
                zIndexOffset={Math.round(score * 100)}
                eventHandlers={{ click: () => setSelected(r) }}
              />
            );
          })}
        </MapContainer>

        {loadingExtra && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="progress_activity" className="text-base animate-spin" />
            Meer plaatsen laden…
          </div>
        )}

        {zoom < 7 && !loadingExtra && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="zoom_in" className="text-base" />
            Zoom in voor meer bestemmingen
          </div>
        )}

        {selected && (
          <DetailOverlay
            result={selected}
            prefs={prefs}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Modale overlay over de kaart met het volledige dag- en uur-detail. De
 *  backdrop dekt de kaart af zodat die niet meer aanklikbaar is. */
function DetailOverlay({
  result,
  prefs,
  onClose,
}: {
  result: ScoredCity;
  prefs: Preferences;
  onClose: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      className="absolute inset-0 z-[1200] bg-on-surface/45 p-1.5 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-lg border-2 border-outline-variant stamp-shadow w-full h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-3 border-b border-outline-variant bg-surface">
          <div className="min-w-0">
            <div className="font-headline-sm text-headline-sm uppercase leading-tight">
              {result.city.name}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
              {result.city.country} · {result.distanceKm} km ·{" "}
              {result.goodDays}/{result.totalDays} goede dagen
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="text-right">
              <div className="font-headline-md text-headline-md text-primary leading-none">
                {result.score.toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                score
              </div>
            </div>
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Hoe wordt de score berekend?"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                showInfo
                  ? "text-primary bg-surface-container-high"
                  : "text-outline hover:text-primary hover:bg-surface-container-high"
              }`}
            >
              <Icon name="info" filled={showInfo} className="text-[20px]" />
            </button>
            <button
              onClick={onClose}
              aria-label="Sluiten"
              className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
        </div>
        {showInfo && (
          <div className="px-3 pt-3">
            <ScoreInfo
              wantSun={prefs.wantSun}
              wantDry={prefs.wantDry}
              wantSnow={prefs.wantSnow}
            />
          </div>
        )}
        <DayDetail days={result.days} city={result.city} />
      </div>
    </div>
  );
}
