"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { RainOverlay } from "./RainOverlay";
import {
  fetchMinutelyForecast,
  nowcastHasRain,
  type MinutelyData,
} from "../lib/weather";

/**
 * Regenicoon-knop voor de detail-headers: opent de Regenvoorspelling (minuut-
 * fijn eerste uur + uurlijks daarna) voor de gegeven plaats. Haalt de data pas
 * op bij de eerste klik en cachet ze; bij een andere plaats wordt ze gereset.
 */
export function RainButton({
  place,
}: {
  place: { name: string; lat: number; lon: number };
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MinutelyData | null>(null);

  // Meteen ophalen, niet pas bij de eerste klik: zonder die data weten we niet
  // of er regen op komst is, en dan kan de knop ook niet waarschuwen.
  useEffect(() => {
    let active = true;
    setOpen(false);
    setData(null);
    fetchMinutelyForecast(place)
      .then((d) => active && setData(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [place]);

  const rainExpected = nowcastHasRain(data);
  const alert = rainExpected && !open;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Regenvoorspelling"
        aria-pressed={open}
        title={
          rainExpected
            ? "Regen verwacht! Klik voor details"
            : "Regenvoorspelling volgende uur"
        }
        className={`w-10 h-10 shrink-0 rounded-full border-2 flex items-center justify-center active-press ${
          open
            ? "bg-primary border-primary"
            : "border-outline-variant hover:bg-surface-container-high"
        } ${alert ? "rain-alert" : ""}`}
      >
        <Icon
          name="raindrops"
          className={`text-[24px] ${open ? "text-on-primary" : "text-primary"} ${
            alert ? "rain-alert-icon" : ""
          }`}
        />
      </button>
      {open && data && (
        <RainOverlay
          data={data}
          location={place.name}
          onClose={() => setOpen(false)}
          // Zelfde schermhoogte als op de kaart. Het detail-scherm begint hoger
          // (het overdekt ook de zoekbalk, ~95px), en de kaart-overlay zit op
          // ~161+237. Samen ≈ 332px vanaf de detail-bovenkant.
          topPx={332}
        />
      )}
    </>
  );
}
