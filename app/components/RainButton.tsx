"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { RainOverlay } from "./RainOverlay";
import { fetchMinutelyForecast, type MinutelyData } from "../lib/weather";

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
  const [loading, setLoading] = useState(false);

  // Andere plaats → paneel sluiten en cache wissen.
  useEffect(() => {
    setOpen(false);
    setData(null);
  }, [place]);

  // Toggle: klik opent het paneel, nog eens klikken sluit het weer.
  const toggleRain = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    fetchMinutelyForecast(place)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <>
      <button
        onClick={toggleRain}
        aria-label="Regenvoorspelling"
        aria-pressed={open}
        className={`w-10 h-10 shrink-0 rounded-full border-2 flex items-center justify-center active-press ${
          open
            ? "bg-primary border-primary"
            : "border-outline-variant hover:bg-surface-container-high"
        }`}
      >
        <Icon
          name="raindrops"
          className={`text-[24px] ${open ? "text-on-primary" : "text-primary"}`}
        />
      </button>
      {open && data && (
        <RainOverlay
          data={data}
          location={place.name}
          onClose={() => setOpen(false)}
          topPx={64}
        />
      )}
    </>
  );
}
