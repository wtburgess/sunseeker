"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { type MinutelyData } from "../lib/weather";

const LINE = "#5f8091";
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

// De tijdstrings zijn de lokale kloktijd van de plaats ("2026-07-17T16:30").
// We lezen ze rechtstreeks uit de string, zodat de weergave onafhankelijk is
// van de tijdzone van het toestel dat de app toont.
/** Klok-uur uit een ISO-tijd ("2026-07-17T16:00" → "16u"). */
const clockHour = (iso: string) => `${Number(iso.slice(11, 13))}u`;
/** Uur:minuut uit een ISO-tijd ("2026-07-17T09:45" → "09:45"). */
const clockTime = (iso: string) => iso.slice(11, 16);

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
    const padT = 22;
    const padB = 24;
    const gx0 = padL;
    const gx1 = w - padR;
    const gy0 = padT;
    const gy1 = h - padB;
    const gW = gx1 - gx0;
    const gH = gy1 - gy0;

    const gap = 12; // ruimte rond de scheidingslijn
    const minFrac = 0.5; // aandeel breedte voor het eerste uur (kwartieren)
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

    // Verticale hulplijnen: elk kwartier in het minuut-deel, en bij elk uur-vak.
    ctx.strokeStyle = GRIDLIGHT;
    for (let v = 15; v < 60; v += 15) {
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
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = AXIS;
    for (let i = 0; i <= 4; i++) {
      const y = gy0 + (gH * i) / 4;
      const val = (maxRain * (4 - i)) / 4;
      ctx.fillText(val.toFixed(maxRain <= 3 ? 1 : 0), gx0 - 5, y);
    }
    // Eenheid linksboven (iets hoger dan voorheen).
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("mm/u", 2, 0);

    // ── Kwartier-deel: staafjes per 15 min (extra smalle balkjes)
    const quarterW = minW / 4;
    ctx.fillStyle = LINE;
    data.nextHour.forEach((m, i) => {
      const off = Math.min(60, Math.max(0, m.minute));
      if (off >= 60) return;
      const bx = minX0 + (minW * off) / 60;
      const barGap = quarterW * 0.4; // 40% tussenruimte (veel smallere balkjes)
      const barW = quarterW - barGap;
      const by = yFor(minInt[i]);
      ctx.fillRect(bx + barGap / 2, by, barW, Math.max(0, gy1 - by));
    });

    // ── Uur-deel: staafjes ───────────────────────────────────────────────
    const nHr = hrInt.length;
    if (nHr > 0) {
      const slot = hrW / nHr;
      const barGap = slot * 0.35; // 35% tussenruimte (smallere balkjes)
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
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "alphabetic";
    const ly = h - 8;

    // Minuut-deel: echte lokale tijd per kwartier (max 4 labels binnen het
    // eerste uur), gecentreerd onder het midden van elk balkje zodat ze niet
    // overlappen. We lezen de tijd rechtstreeks uit elk kwartierpunt.
    ctx.textAlign = "center";
    for (let i = 0; i < Math.min(4, data.nextHour.length); i++) {
      const cx = minX0 + (minW * (i * 15 + 7.5)) / 60;
      ctx.fillText(clockTime(data.nextHour[i].time), cx, ly);
    }

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

  // Standaard: vast onderaan (detail-schermen). Met `topPx`: zwevend bovenaan de
  // kaart, net onder de drie ronde knoppen rechts.
  const anchor: CSSProperties =
    topPx != null
      ? { position: "absolute", top: `${topPx}px` }
      : { position: "fixed", bottom: "0.75rem" };

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
        width={typeof window !== "undefined" ? window.innerWidth - 64 : 300}
        height={180}
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
