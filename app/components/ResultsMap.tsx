"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Icon } from "./Icon";
import { conditionFromCode, type ScoredCity } from "../lib/weather";

type Props = {
  results: ScoredCity[];
  origin: { lat: number; lon: number; label: string };
};

/** Kleur (hex) van de score-badge — spiegelt de lijstweergave. */
function scoreHex(score: number) {
  if (score >= 9) return { bg: "#fbbb4c", fg: "#5a3d00", bd: "#7f5700" }; // heel fel
  if (score >= 8) return { bg: "#febe4e", fg: "#724d00", bd: "#7f5700" }; // fel
  if (score >= 7) return { bg: "#ffdead", fg: "#724d00", bd: "#c79a4a" }; // zachter
  return { bg: "#e0d9cc", fg: "#56423d", bd: "#8a726b" }; // grijs
}

function badgeIcon(score: number, iconName: string) {
  const { bg, fg, bd } = scoreHex(score);
  return L.divIcon({
    className: "",
    html: `<div style="width:40px;height:42px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:1px;border-radius:11px;background:${bg};
      color:${fg};border:2px solid ${bd};box-shadow:0 1px 4px rgba(0,0,0,.35);
      font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:15px;line-height:1">
      <span>${score.toFixed(1)}</span>
      <span style="font-family:'Material Symbols Outlined';font-size:15px;
      font-variation-settings:'FILL' 1;line-height:1">${iconName}</span></div>`,
    iconSize: [40, 42],
    iconAnchor: [20, 21],
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

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

export default function ResultsMap({ results, origin }: Props) {
  const dayCount = results[0]?.days.length ?? 0;
  // -1 = totaal (beste stretch), anders een specifieke dag-index.
  const [dayIdx, setDayIdx] = useState(-1);

  const points: [number, number][] = [
    [origin.lat, origin.lon],
    ...results.map((r) => [r.city.lat, r.city.lon] as [number, number]),
  ];

  const dayLabel =
    dayIdx === -1
      ? "Totaal · beste stretch"
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
          <span>Totaal</span>
          <span>Dag {dayCount}</span>
        </div>
      </div>

      {/* Kaart */}
      <div className="h-[60vh] rounded-xl overflow-hidden border-2 border-outline-variant stamp-shadow">
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

          <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
            <Popup>
              <strong>{origin.label}</strong>
              <br />
              Je vertrekpunt
            </Popup>
          </Marker>

          {results.map((r) => {
            const day = dayIdx === -1 ? null : r.days[dayIdx];
            const score = day ? day.score : r.score;
            const cond = day ? conditionFromCode(day.code) : r.condition;
            const temp = day ? Math.round(day.tMax) : r.avgTempMax;
            return (
              <Marker
                key={r.city.id}
                position={[r.city.lat, r.city.lon]}
                icon={badgeIcon(score, cond.icon)}
              >
                <Popup>
                  <strong style={{ textTransform: "uppercase" }}>
                    {r.city.name}
                  </strong>
                  <br />
                  {r.city.country} · {r.distanceKm} km
                  <br />
                  {cond.label} · {temp}°C
                  <br />
                  <span style={{ color: "#9d3d22", fontWeight: 700 }}>
                    Score {score.toFixed(1)}
                  </span>{" "}
                  ({dayLabel})
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
