"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Icon } from "./Icon";
import {
  conditionFromHourDayNight,
  fetchHourly,
  type HourForecast,
} from "../lib/weather";

const nl1 = (n: number) =>
  n.toLocaleString("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Uur-voor-uur detail voor één dag (00:00 → 24:00), geopend vanaf 07:00. */
export function HourDetail({
  place,
  date,
  onClose,
}: {
  place: { name: string; lat: number; lon: number };
  date: string;
  onClose: () => void;
}) {
  const [hours, setHours] = useState<HourForecast[] | null>(null);
  const [error, setError] = useState(false);
  const sevenRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let active = true;
    setHours(null);
    setError(false);
    fetchHourly(place, date)
      .then((h) => active && setHours(h))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [place, date]);

  // Bij het openen: de lijst naar 07:00 scrollen.
  useEffect(() => {
    if (hours) sevenRef.current?.scrollIntoView({ block: "start" });
  }, [hours]);

  const dateLabel = new Date(date).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="absolute inset-0 z-[1300] bg-surface flex flex-col animate-fade-in">
      {/* Kop met terugknop */}
      <div className="flex items-center gap-2 px-3 h-14 shrink-0 border-b-2 border-outline-variant">
        <button
          onClick={onClose}
          aria-label="Terug"
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="arrow_back" className="text-[22px]" />
        </button>
        <div className="flex-grow min-w-0">
          <div className="font-headline-md text-headline-md uppercase tracking-wide leading-none truncate">
            {place.name}
          </div>
          <div className="text-[11px] text-on-surface-variant capitalize">
            {dateLabel}
          </div>
        </div>
      </div>

      {/* Uren */}
      <div className="flex-grow overflow-y-auto">
        {error ? (
          <p className="p-4 text-error font-label-lg text-label-lg flex items-center gap-2">
            <Icon name="error" filled /> Kon het weer niet laden.
          </p>
        ) : !hours ? (
          <div className="flex items-center justify-center h-full gap-2 text-outline font-label-lg text-label-lg uppercase tracking-widest">
            <Icon name="progress_activity" className="animate-spin" /> Laden…
          </div>
        ) : (
          <ul>
            {hours.map((h) => (
              <HourRow
                key={h.time}
                h={h}
                rowRef={h.hour === 7 ? sevenRef : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HourRow({ h, rowRef }: { h: HourForecast; rowRef?: Ref<HTMLLIElement> }) {
  const cond = conditionFromHourDayNight(h);
  const hasRain = h.precip > 0;
  return (
    <li
      ref={rowRef}
      className="flex items-center gap-2.5 px-3 py-1.5 border-b border-outline-variant"
    >
      {/* Tijdvak: begin (gedempt) boven eind (fel) */}
      <div className="w-16 shrink-0 leading-none">
        <div className="text-[14px] text-on-surface-variant">{hh(h.hour)} -</div>
        <div className="text-[17px] font-bold text-primary mt-0.5">
          {hh((h.hour + 1) % 24)}
        </div>
      </div>

      {/* Weericoon (dag/nacht) */}
      <Icon
        name={cond.icon}
        filled={cond.filled}
        className={`text-[38px] shrink-0 ${cond.iconColor}`}
      />

      {/* Temperatuur */}
      <div className="w-11 shrink-0 text-right font-headline-sm text-[22px]">
        {Math.round(h.temp)}°
      </div>

      {/* Zon-minuten (enkel overdag) + (enkel bij neerslag) kans/mm */}
      <div className="flex-grow min-w-0 pl-1 flex flex-col gap-1 text-[15px] text-on-surface-variant leading-none">
        {h.isDay && (
          <span className="flex items-center gap-1">
            <Icon name="sunny" filled className="text-[18px] text-secondary" />
            {h.sunMinutes} min
          </span>
        )}
        {hasRain && (
          <span className="flex items-center gap-2.5">
            {h.precipProb > 0 && (
              <span className="flex items-center gap-0.5">
                <Icon name="water_drop" className="text-[18px]" />
                {Math.round(h.precipProb)}%
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Icon name="rainy" className="text-[18px]" />
              {nl1(h.precip)}mm
            </span>
          </span>
        )}
      </div>

      {/* Wind: pijl in de stroomrichting + Beaufort */}
      <div className="w-11 shrink-0 flex flex-col items-center text-on-surface-variant leading-none">
        <Icon
          name="navigation"
          filled
          className="text-[20px]"
          style={{ transform: `rotate(${h.windDir + 180}deg)` }}
        />
        <span className="text-[12px] mt-0.5">{h.windBft} Bft</span>
      </div>
    </li>
  );
}
