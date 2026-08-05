"use client";

import { isInKnmiDomain } from "../lib/weather";

const nl1 = (n: number) =>
  n.toLocaleString("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * Uitleg waarom de twee weermodellen het oneens zijn over de neerslag van een
 * dag. Temperatuur en zonuren middelen we stilzwijgend — daar is het gemiddelde
 * beter dan elk model apart. Bij regen kan dat niet: het gemiddelde van 0 en
 * 10 mm is 5 mm, een dag die geen van beide modellen voorspelt.
 */
export function DivergenceModal({
  gfsPrecip,
  knmiPrecip,
  point,
  dateLabel,
  onClose,
}: {
  gfsPrecip: number;
  knmiPrecip: number;
  point: { lat: number; lon: number };
  dateLabel?: string;
  onClose: () => void;
}) {
  const localModel = isInKnmiDomain(point.lat, point.lon);
  const droog = gfsPrecip < knmiPrecip ? "GFS" : "KNMI";
  const nat = droog === "GFS" ? "KNMI" : "GFS";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border-2 border-outline-variant max-w-[400px] p-4 stamp-shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[24px]">⚠️</div>
          <h2 className="font-headline-sm text-[18px] text-on-surface">
            Onzeker over regen
          </h2>
        </div>
        {dateLabel && (
          <p className="text-[13px] text-outline mb-3">{dateLabel}</p>
        )}

        <div className="text-[13px] text-on-surface-variant mb-3">
          🌧️ <strong>GFS</strong> zegt {nl1(gfsPrecip)} mm,{" "}
          <strong>KNMI</strong> zegt {nl1(knmiPrecip)} mm over de hele dag
          (verschil {nl1(Math.abs(gfsPrecip - knmiPrecip))} mm).
        </div>

        <p className="text-[12px] text-on-surface-variant leading-snug mb-3">
          Temperatuur en zonuren tonen we als gemiddelde van beide modellen, want
          daar helpt middelen. Bij regen niet: het gemiddelde zou een dag
          opleveren die geen van beide modellen voorspelt.{" "}
          {localModel ? (
            <>
              KNMI draait hier als lokaal hoge-resolutie model (Benelux en
              Noordzee) en <strong>weegt hier dus zwaarder</strong> — die zegt{" "}
              {nl1(knmiPrecip)} mm.
            </>
          ) : (
            <>
              Deze plek ligt buiten het KNMI-modelgebied, dus{" "}
              <strong>geen van beide is hier aantoonbaar nauwkeuriger</strong>.
              Houd rekening met het natste scenario ({nat}).
            </>
          )}
        </p>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-primary text-on-primary font-headline-sm text-[14px] uppercase active-press"
        >
          Sluit
        </button>
      </div>
    </div>
  );
}
