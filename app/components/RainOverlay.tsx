"use client";

import { useEffect, useRef, useState } from "react";
import { type MinutelyData } from "../lib/weather";

const LINE = "#5f8091";
const AREA = "rgba(95, 128, 145, 0.2)";
const ACCENT = "#9d3d22";
const GRID = "#dcdcdc";
const GRIDLIGHT = "#efefef";
const AXIS = "#888";

/** Ronde bovengrens voor de y-as (mm/u), zodat de schaal netjes oogt. */
function niceMax(v: number): number {
  const steps = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100];
  for (const s of steps) if (v <= s) return s;
  return Math.ceil(v / 50) * 50;
}

/** Klok-uur uit een ISO-tijd ("2026-07-17T16:00" → "16u"). */
const clockHour = (iso: string) => `${Number(iso.slice(11, 13))}u`;

export function RainOverlay({
  data,
  onClose,
  location,
}: {
  data: MinutelyData | null;
  onClose: () => void;
  location?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [subtitle, setSubtitle] = useState("");

  // Samenvatting boven de grafiek: wanneer begint de regen?
  useEffect(() => {
    if (!data) return;
    const firstWet = data.nextHour.find((m) => m.precip > 0.05);
    if (firstWet && firstWet.minute <= 0) {
      setSubtitle("Het regent nu");
    } else if (firstWet) {
      setSubtitle(`Over ± ${firstWet.minute} minuten begint regen`);
    } else {
      const hr = data.nextHours.find((x) => x.precip > 0.1);
      if (hr) {
        setSubtitle(`Regen verwacht over ± ${hr.hoursAhead} uur`);
      } else {
        setSubtitle("Geen regen verwacht de komende uren");
      }
    }
  }, [data]);

  // Grafiek tekenen: minuten (lijn) links, uren (staafjes) rechts.
  useEffect(() => {
    if (!canvasRef.current || !data) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    // Alles omgerekend naar intensiteit mm/u: kwartier-neerslag (mm/15min) × 4,
    // uur-neerslag staat al in mm/u. Zo staan beide delen op dezelfde schaal.
    const minInt = data.nextHour.map((m) => m.precip * 4);
    const hrInt = data.nextHours.map((x) => x.precip);
    const maxRain = niceMax(Math.max(0, ...minInt, ...hrInt));

    // Vlak-indeling.
    const padL = 34;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const gx0 = padL;
    const gx1 = w - padR;
    const gy0 = padT;
    const gy1 = h - padB;
    const gW = gx1 - gx0;
    const gH = gy1 - gy0;

    const gap = 12; // ruimte rond de scheidingslijn
    const minFrac = 0.44; // aandeel breedte voor het minuut-uur
    const minW = (gW - gap) * minFrac;
    const minX0 = gx0;
    const minX1 = gx0 + minW;
    const hrX0 = minX1 + gap;
    const hrX1 = gx1;
    const hrW = hrX1 - hrX0;
    const divX = minX1 + gap / 2;

    const yFor = (v: number) => gy1 - (gH * v) / maxRain;

    // Horizontale hulplijnen: fijne verdeling (8), met de hoofdlijnen (4) wat
    // donkerder. Labels enkel op de hoofdlijnen.
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = gy0 + (gH * i) / 8;
      ctx.strokeStyle = i % 2 === 0 ? GRID : GRIDLIGHT;
      ctx.beginPath();
      ctx.moveTo(gx0, y);
      ctx.lineTo(gx1, y);
      ctx.stroke();
    }

    // Verticale hulplijnen: elke 10 min in het minuut-deel, en bij elk uur-vak.
    ctx.strokeStyle = GRIDLIGHT;
    for (let v = 10; v < 60; v += 10) {
      const x = minX0 + (minW * v) / 60;
      ctx.beginPath();
      ctx.moveTo(x, gy0);
      ctx.lineTo(x, gy1);
      ctx.stroke();
    }
    if (hrInt.length > 0) {
      const slot = hrW / hrInt.length;
      for (let i = 0; i <= hrInt.length; i++) {
        const x = hrX0 + i * slot;
        ctx.beginPath();
        ctx.moveTo(x, gy0);
        ctx.lineTo(x, gy1);
        ctx.stroke();
      }
    }

    // Y-labels (mm/u) op de hoofdlijnen.
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = AXIS;
    for (let i = 0; i <= 4; i++) {
      const y = gy0 + (gH * i) / 4;
      const val = (maxRain * (4 - i)) / 4;
      ctx.fillText(val.toFixed(maxRain <= 3 ? 1 : 0), gx0 - 5, y);
    }
    // Eenheid linksboven.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("mm/u", 2, 2);

    // ── Kwartier-deel: gevuld vlak + lijn ────────────────────────────────
    // x volgt de echte minuut-offset (0…60) van elk punt, niet de index.
    const nMin = minInt.length;
    const minX = (i: number) =>
      minX0 + (minW * Math.min(60, Math.max(0, data.nextHour[i].minute))) / 60;

    if (nMin > 0) {
      ctx.beginPath();
      ctx.moveTo(minX(0), yFor(minInt[0]));
      for (let i = 1; i < nMin; i++) ctx.lineTo(minX(i), yFor(minInt[i]));
      ctx.lineTo(minX(nMin - 1), gy1);
      ctx.lineTo(minX(0), gy1);
      ctx.closePath();
      ctx.fillStyle = AREA;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(minX(0), yFor(minInt[0]));
      for (let i = 1; i < nMin; i++) ctx.lineTo(minX(i), yFor(minInt[i]));
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // ── Uur-deel: staafjes ───────────────────────────────────────────────
    const nHr = hrInt.length;
    if (nHr > 0) {
      const slot = hrW / nHr;
      const barGap = Math.min(6, slot * 0.25);
      const barW = slot - barGap;
      ctx.fillStyle = LINE;
      for (let i = 0; i < nHr; i++) {
        const bx = hrX0 + i * slot + barGap / 2;
        const by = yFor(hrInt[i]);
        const bh = gy1 - by;
        ctx.fillRect(bx, by, barW, Math.max(0, bh));
      }
    }

    // ── Scheidingslijn tussen minuten en uren ────────────────────────────
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(divX, gy0);
    ctx.lineTo(divX, gy1);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── X-labels ─────────────────────────────────────────────────────────
    ctx.fillStyle = AXIS;
    ctx.font = "9px sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    const ly = h - 8;

    // Minuut-deel: nu · 10m · 20m · 30m · 40m · 50m · 1u
    ctx.fillText("nu", minX0 + 5, ly);
    for (let v = 10; v <= 50; v += 10) {
      ctx.fillText(`${v}m`, minX0 + (minW * v) / 60, ly);
    }
    ctx.fillText("1u", divX, ly);

    // Uur-deel: klok-uur onder elke staaf (om-en-om bij krappe ruimte).
    if (nHr > 0) {
      const slot = hrW / nHr;
      const skip = slot < 24;
      for (let i = 0; i < nHr; i++) {
        if (skip && i % 2 === 1) continue;
        const cx = hrX0 + i * slot + slot / 2;
        ctx.fillText(clockHour(data.nextHours[i].time), cx, ly);
      }
    }
  }, [data]);

  if (!data) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        border: "1.5px solid #9d3d22",
        borderBottom: "none",
        borderTopLeftRadius: "12px",
        borderTopRightRadius: "12px",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
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
            Regenvoorspelling{location ? ` ${location}` : ""}
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
        width={typeof window !== "undefined" ? window.innerWidth - 32 : 340}
        height={150}
        style={{
          border: "1px solid #eee",
          borderRadius: "8px",
          marginBottom: "0.75rem",
          width: "100%",
        }}
      />

      {/* Legenda-regel */}
      <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>
        Komend uur per 15 min · daarna per uur (± 8 u vooruit)
      </p>
    </div>
  );
}
