"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import {
  RAIN_ALERT_MMH,
  rainIntensity,
  type MinutelyData,
  type RainPoint,
} from "../lib/weather";

const LINE = "#5f8091";
const ACCENT = "#9d3d22";
const GRID = "#dcdcdc";
const GRIDLIGHT = "#efefef";
const AXIS = "#888";

/** Hoogte van de grafiek in CSS-pixels. */
const CHART_H = 180;
/** Aandeel van de breedte voor het fijne deel: het komende uur telt het zwaarst. */
const FINE_WIDTH = 0.5;
/** Ruimte die één tijdlabel minstens nodig heeft. */
const LABEL_PX = 44;

/** Ronde bovengrens voor de y-as (mm/u), zodat de schaal netjes oogt. Motregen
 *  zit rond 0,2 mm/u, dus onderaan moeten de stappen fijn blijven. */
function niceMax(v: number): number {
  const steps = [0.2, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100];
  for (const s of steps) if (v <= s) return s;
  return Math.ceil(v / 50) * 50;
}

// De tijdstrings zijn de lokale kloktijd van de plaats ("2026-07-17T16:30").
// We lezen ze rechtstreeks uit de string, zodat de weergave onafhankelijk is
// van de tijdzone van het toestel dat de app toont.
/** Klok-uur uit een ISO-tijd ("2026-07-17T16:00" → "16u"). */
const clockHour = (iso: string) => `${Number(iso.slice(11, 13))}u`;
/** Uur:minuut uit een ISO-tijd ("2026-07-17T09:45" → "09:45"). */
const clockTime = (iso: string) => iso.slice(11, 16);
/** Minuut binnen het uur ("2026-07-17T09:45" → 45). */
const clockMinute = (iso: string) => Number(iso.slice(14, 16));
/** Getal met komma, zoals de rest van de app. */
const nlNum = (v: number, dec: number) => v.toFixed(dec).replace(".", ",");

/**
 * Samenvatting boven de grafiek: wanneer begint de regen? Fijne punten en uren
 * worden op dezelfde drempel beoordeeld (intensiteit in mm/u), anders meldt de
 * tekst regen die de grafiek niet toont — of omgekeerd.
 */
function rainSummary(data: MinutelyData): string {
  const wet = (p: RainPoint) => rainIntensity(p) >= RAIN_ALERT_MMH;
  const firstFine = data.nextHour.find(wet);
  if (firstFine && firstFine.minutesAhead <= 0) return "Het regent nu";
  if (firstFine) return `Over ± ${firstFine.minutesAhead} minuten begint regen`;

  const hr = data.nextHours.find(wet);
  if (!hr) return "Geen regen verwacht de komende uren";
  return `Regen verwacht over ± ${Math.max(1, Math.round(hr.minutesAhead / 60))} uur`;
}

/** Houdt zoveel labels over dat ze niet op elkaar botsen (altijd de eerste). */
function thinOut<T>(items: T[], widthPx: number): T[] {
  if (items.length === 0) return items;
  const fits = Math.max(1, Math.floor(widthPx / LABEL_PX));
  const step = Math.ceil(items.length / fits);
  return items.filter((_, i) => i % step === 0);
}

export function RainOverlay({
  data,
  onClose,
  location,
  topPx,
}: {
  data: MinutelyData | null;
  onClose: () => void;
  location?: string;
  topPx?: number; // indien gezet: zweeft bovenaan (net onder de kaartknoppen)
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Tekent één doorlopende curve over de hele periode. Beide delen staan op
   * dezelfde y-as (intensiteit in mm/u) en op dezelfde tijdas, en elk punt komt
   * in het midden van zijn eigen tijdvak te liggen. Alleen de tijdschaal
   * verandert halverwege: het komende uur krijgt de helft van de breedte,
   * omdat dat het deel is waar je iets aan hebt.
   */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.clientWidth || 300;
    // Scherpe lijnen op een telefoon: de canvas-buffer volgt de pixeldichtheid,
    // maar we tekenen in gewone CSS-pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(CHART_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, CHART_H);

    const fine = data.nextHour;
    const hours = data.nextHours;
    const all = [...fine, ...hours];
    if (all.length === 0) return;

    // Vlak-indeling.
    const padL = 34;
    const padR = 12;
    const padT = 22;
    const padB = 24;
    const gx0 = padL;
    const gx1 = w - padR;
    const gy0 = padT;
    const gy1 = CHART_H - padB;
    const gW = gx1 - gx0;
    const gH = gy1 - gy0;

    // Tijdas in minuten vanaf nu: van het begin van het eerste tijdvak tot het
    // einde van het laatste. De naad ligt op het einde van het fijne deel —
    // waar het uur-deel exact begint, zodat de lijn doorloopt.
    const t0 = all[0].minutesAhead;
    const lastFine = fine[fine.length - 1];
    const lastAll = all[all.length - 1];
    const split = lastFine ? lastFine.minutesAhead + lastFine.spanMinutes : t0;
    const tEnd = lastAll.minutesAhead + lastAll.spanMinutes;

    const fineSpan = split - t0;
    const hourSpan = tEnd - split;
    const fineFrac = fineSpan > 0 ? (hourSpan > 0 ? FINE_WIDTH : 1) : 0;
    const xFor = (t: number) => {
      if (fineSpan > 0 && t <= split)
        return gx0 + gW * fineFrac * ((t - t0) / fineSpan);
      if (hourSpan <= 0) return gx0 + gW * fineFrac;
      return gx0 + gW * fineFrac + gW * (1 - fineFrac) * ((t - split) / hourSpan);
    };

    const maxRain = niceMax(Math.max(0, ...all.map(rainIntensity)));
    const yFor = (v: number) => gy1 - (gH * v) / maxRain;

    // Horizontale hulplijnen: fijne verdeling (8), hoofdlijnen (4) donkerder.
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = gy0 + (gH * i) / 8;
      ctx.strokeStyle = i % 2 === 0 ? GRID : GRIDLIGHT;
      ctx.beginPath();
      ctx.moveTo(gx0, y);
      ctx.lineTo(gx1, y);
      ctx.stroke();
    }

    // Verticale hulplijnen: elk kwartier in het fijne deel, elk heel uur daarna.
    ctx.strokeStyle = GRIDLIGHT;
    const marks = [
      ...fine.filter((p) => clockMinute(p.time) % 15 === 0),
      ...hours,
    ];
    for (const p of marks) {
      const x = xFor(p.minutesAhead);
      ctx.beginPath();
      ctx.moveTo(x, gy0);
      ctx.lineTo(x, gy1);
      ctx.stroke();
    }

    // Y-labels (mm/u) op de hoofdlijnen.
    const dec = maxRain <= 0.5 ? 2 : maxRain <= 3 ? 1 : 0;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = AXIS;
    for (let i = 0; i <= 4; i++) {
      const y = gy0 + (gH * i) / 4;
      ctx.fillText(nlNum((maxRain * (4 - i)) / 4, dec), gx0 - 5, y);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("mm/u", 2, 0);

    // ── Eén curve over beide delen ───────────────────────────────────────
    // Elk punt in het midden van zijn tijdvak; de lijn loopt vlak door naar de
    // randen, zodat het eerste en laatste tijdvak volledig zichtbaar zijn.
    const pts = all.map((p) => ({
      x: xFor(p.minutesAhead + p.spanMinutes / 2),
      y: yFor(rainIntensity(p)),
    }));
    const path = [
      { x: xFor(t0), y: pts[0].y },
      ...pts,
      { x: xFor(tEnd), y: pts[pts.length - 1].y },
    ];

    ctx.fillStyle = LINE + "33";
    ctx.beginPath();
    ctx.moveTo(path[0].x, gy1);
    path.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(path[path.length - 1].x, gy1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    // Naad: waar de fijne punten overgaan in hele uren. Enkel een merkteken —
    // de curve zelf loopt eroverheen door.
    if (fineSpan > 0 && hourSpan > 0) {
      ctx.strokeStyle = ACCENT + "66";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xFor(split), gy0);
      ctx.lineTo(xFor(split), gy1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── X-labels: echte kloktijden, op de hulplijnen ─────────────────────
    ctx.fillStyle = AXIS;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const ly = CHART_H - 8;

    const fineLabels = thinOut(
      fine.filter((p) => clockMinute(p.time) % 15 === 0),
      gW * fineFrac,
    );
    for (const p of fineLabels) {
      ctx.fillText(clockTime(p.time), xFor(p.minutesAhead), ly);
    }
    const hourLabels = thinOut(hours, gW * (1 - fineFrac));
    for (const p of hourLabels) {
      ctx.fillText(clockHour(p.time), xFor(p.minutesAhead), ly);
    }
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  if (!data) return null;

  // Standaard: vast onderaan (detail-schermen). Met `topPx`: zwevend bovenaan de
  // kaart, net onder de drie ronde knoppen rechts.
  const anchor: CSSProperties =
    topPx != null
      ? { position: "absolute", top: `${topPx}px` }
      : { position: "fixed", bottom: "0.75rem" };

  const fineStep = data.nextHour[0]?.spanMinutes ?? 15;
  const subtitle = rainSummary(data);

  return (
    <div
      style={{
        ...anchor,
        left: "0.75rem",
        right: "0.75rem",
        backgroundColor: "#fff",
        border: "1.5px solid #9d3d22",
        borderRadius: "12px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        zIndex: 2000,
        maxHeight: "45vh",
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "16px", fontWeight: 600 }}>
            REGEN-RADAR{location ? ": " : ""}<span style={{ color: "#999" }}>{location}</span>
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Sluiten"
          style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            padding: 0,
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>

      {/* Grafiek */}
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #eee",
          borderRadius: "8px",
          marginBottom: "0.75rem",
          width: "100%",
          height: `${CHART_H}px`,
        }}
      />

      {/* Legenda-regel */}
      <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>
        Komend uur per {fineStep} min · daarna per uur (± 8 u vooruit)
      </p>
    </div>
  );
}
