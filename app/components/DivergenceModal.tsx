"use client";

import { isInKnmiDomain, type ModelDayValues } from "../lib/weather";

/**
 * Uitleg waarom twee weermodellen (GFS en KNMI) het oneens zijn over een dag.
 *
 * Binnen het KNMI-domein draait KNMI als lokaal hoge-resolutie model en weegt
 * het zwaarder. Daarbuiten valt Open-Meteo terug op een globaal model — dan
 * vergelijk je twee globale modellen en is geen van beide aantoonbaar beter.
 */
export function DivergenceModal({
  reason,
  gfs,
  knmi,
  point,
  dateLabel,
  onClose,
}: {
  reason: string;
  gfs: ModelDayValues;
  knmi: ModelDayValues;
  point: { lat: number; lon: number };
  dateLabel?: string;
  onClose: () => void;
}) {
  const localModel = isInKnmiDomain(point.lat, point.lon);
  const nl1 = (n: number) =>
    n.toLocaleString("nl-BE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

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
            Modellen divergeren
          </h2>
        </div>
        {dateLabel && (
          <p className="text-[13px] text-outline mb-3">{dateLabel}</p>
        )}

        <div className="text-[13px] text-on-surface-variant mb-3 flex flex-col gap-1">
          {reason.includes("temp") && (
            <div>
              🌡️ <strong>Temperatuur:</strong> GFS zegt {nl1(gfs.tMax)}°C, KNMI zegt{" "}
              {nl1(knmi.tMax)}°C (verschil {nl1(Math.abs(gfs.tMax - knmi.tMax))}°C)
            </div>
          )}
          {reason.includes("rain") && (
            <div>
              🌧️ <strong>Regen:</strong> GFS zegt {nl1(gfs.precip)} mm, KNMI zegt{" "}
              {nl1(knmi.precip)} mm (verschil{" "}
              {nl1(Math.abs(gfs.precip - knmi.precip))} mm)
            </div>
          )}
          {reason.includes("sun") && (
            <div>
              ☀️ <strong>Zon:</strong> GFS zegt {nl1(gfs.sunHours)} u, KNMI zegt{" "}
              {nl1(knmi.sunHours)} u (verschil{" "}
              {nl1(Math.abs(gfs.sunHours - knmi.sunHours))} u)
            </div>
          )}
        </div>

        <p className="text-[12px] text-on-surface-variant leading-snug mb-3">
          {localModel ? (
            <>
              <strong>Advies:</strong> KNMI draait hier als lokaal hoge-resolutie
              model (Benelux en Noordzee) en is voor deze regio doorgaans
              nauwkeuriger dan het globale GFS. Zijn beide modellen het eens, dan
              is de kans groot dat het klopt; wijken ze af, dan{" "}
              <strong>weegt KNMI hier zwaarder</strong>.
            </>
          ) : (
            <>
              <strong>Let op:</strong> deze plek ligt buiten het KNMI-modelgebied
              (Benelux en Noordzee). Je vergelijkt hier dus twee globale modellen,
              en <strong>geen van beide is aantoonbaar nauwkeuriger</strong>. Het
              verschil zegt wél iets: hoe groter, hoe onzekerder deze dag.
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
