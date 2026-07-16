"use client";

import { useEffect, useRef, useState } from "react";
import { type MinutelyData } from "../lib/weather";

export function RainOverlay({ data, onClose }: { data: MinutelyData | null; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nextRainMin, setNextRainMin] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    // Zoek eerste minuut met regen (> 0.1 mm)
    const idx = data.nextHour.findIndex((m) => m.precip > 0.1);
    setNextRainMin(idx >= 0 ? idx : null);
  }, [data]);

  // Teken grafiek
  useEffect(() => {
    if (!canvasRef.current || !data) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const padding = 30;
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;

    // Background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    // Max regen (voor schaal)
    const maxRain = Math.max(...data.nextHour.map((m) => m.precip), 0.5);

    // Grid + labels
    ctx.strokeStyle = "#e0e0e0";
    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";

    for (let i = 0; i <= 6; i++) {
      const y = padding + (graphH * i) / 6;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();

      const val = ((maxRain * (6 - i)) / 6).toFixed(1);
      ctx.fillText(val, padding - 15, y + 4);
    }

    // X-as labels (elke 10 min)
    ctx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const x = padding + (graphW * i) / 6;
      ctx.fillText(`${i * 10}m`, x, h - 10);
    }

    // Regen-lijn
    ctx.strokeStyle = "#5f8091";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();

    data.nextHour.forEach((m, i) => {
      const x = padding + (graphW * i) / 60;
      const y = padding + graphH - (graphH * m.precip) / maxRain;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Regen-area (light fill)
    ctx.fillStyle = "rgba(95, 128, 145, 0.2)";
    ctx.lineTo(w - padding, padding + graphH);
    ctx.lineTo(padding, padding + graphH);
    ctx.fill();

    // Huidae minuut marker
    const nowX = padding + graphW * 0.5 / 60;
    ctx.strokeStyle = "#9d3d22";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(nowX, padding);
    ctx.lineTo(nowX, padding + graphH);
    ctx.stroke();
    ctx.setLineDash([]);
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
        borderTopLeftRadius: "12px",
        borderTopRightRadius: "12px",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
        zIndex: 999,
        maxHeight: "40vh",
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "16px", fontWeight: "600" }}>
            Regen voorspelling
          </h3>
          {nextRainMin !== null ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
              Over {nextRainMin} minuut{nextRainMin !== 1 ? "en" : ""} begint regen
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
              Geen regen verwacht in het volgende uur
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            padding: "0",
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
        width={window.innerWidth - 32}
        height={150}
        style={{
          border: "1px solid #eee",
          borderRadius: "8px",
          marginBottom: "0.75rem",
        }}
      />

      {/* Info */}
      <p style={{ margin: 0, fontSize: "12px", color: "#999", marginTop: "0.5rem" }}>
        ← Huidity nu | Volgende 60 minuten →
      </p>
    </div>
  );
}
