"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { type City } from "../lib/cities";
import {
  conditionFromDay,
  conditionFromHour,
  fetchHourly,
  rainIcon,
  type DayForecast,
  type HourForecast,
} from "../lib/weather";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
  });

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "short" });

/** Uitklapbaar dag-overzicht; per dag klapt het uur-detail uit. Gedeeld door
 *  de lijstweergave en de kaart-popup. */
export function DayDetail({ days, city }: { days: DayForecast[]; city: City }) {
  return (
    <div className="border-t-2 border-dashed border-outline-variant bg-surface-container-low px-3 md:px-md py-base animate-fade-in">
      <div className="flex flex-col">
        {days.map((day) => (
          <DayRow key={day.date} day={day} city={city} />
        ))}
      </div>
    </div>
  );
}

function DayRow({ day, city }: { day: DayForecast; city: City }) {
  const cond = conditionFromDay(day);
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<HourForecast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Uurdata één keer lazy laden zodra de dag wordt uitgeklapt.
    if (next && !hours && !loading) {
      setLoading(true);
      setError(false);
      try {
        setHours(await fetchHourly(city, day.date));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div
      className={`border-l-4 pl-2 ${
        day.good
          ? "border-secondary bg-secondary-container/15"
          : "border-transparent opacity-70"
      }`}
    >
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 py-sm text-left hover:bg-surface-container-high/40 transition-colors"
      >
        <div className="w-12 flex-shrink-0">
          <div className="font-label-sm text-label-sm uppercase tracking-wide">
            {fmtWeekday(day.date)}
          </div>
          <div className="text-[10px] text-on-surface-variant">
            {fmtDate(day.date)}
          </div>
        </div>
        <Icon
          name={cond.icon}
          filled={cond.filled}
          className={`text-[22px] flex-shrink-0 ${cond.iconColor}`}
        />
        <span className="font-headline-sm text-headline-sm w-9 flex-shrink-0">
          {Math.round(day.tMax)}°
        </span>
        <div className="flex-grow flex items-center gap-2 text-xs text-on-surface-variant min-w-0">
          <span className="flex items-center gap-0.5">
            <Icon name="sunny" className="text-sm" filled />
            {day.sunHours.toFixed(1)}u
          </span>
          {day.precip > 0 && (
            <span className="flex items-center gap-0.5 text-tertiary">
              <Icon name={rainIcon(day.precip, "day")} className="text-sm" />
              {day.precip}mm
            </span>
          )}
        </div>
        <span className="w-8 text-right font-headline-sm text-headline-sm text-primary flex-shrink-0">
          {day.score.toFixed(1)}
        </span>
        <Icon
          name="expand_more"
          className={`text-sm flex-shrink-0 text-on-surface-variant transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <HourDetail hours={hours} loading={loading} error={error} />}
    </div>
  );
}

function HourDetail({
  hours,
  loading,
  error,
}: {
  hours: HourForecast[] | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center gap-1.5 py-3 text-label-sm text-on-surface-variant animate-fade-in">
        <Icon name="progress_activity" className="text-base animate-spin" />
        Uur-detail laden…
      </div>
    );
  if (error)
    return (
      <div className="py-3 text-center text-label-sm text-error animate-fade-in">
        Uurdata kon niet geladen worden.
      </div>
    );
  if (!hours) return null;

  // Toon de daglicht-uren (de "zonuren"); val terug op alles als er geen is.
  const daytime = hours.filter((h) => h.isDay);
  const list = daytime.length ? daytime : hours;

  return (
    <div className="animate-fade-in pb-2 pt-1">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {list.map((h) => (
          <HourCell key={h.time} hour={h} />
        ))}
      </div>
    </div>
  );
}

function HourCell({ hour }: { hour: HourForecast }) {
  const cond = conditionFromHour(hour);
  const sunPct = Math.round((hour.sunMinutes / 60) * 100);
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[42px] rounded-lg bg-surface-container-low/70 px-1 py-1.5">
      <span className="text-[10px] font-label-sm text-on-surface-variant">
        {hour.hour}u
      </span>
      <Icon
        name={cond.icon}
        filled={cond.filled}
        className={`text-[18px] ${cond.iconColor}`}
      />
      <span className="text-label-sm font-headline-sm">
        {Math.round(hour.temp)}°
      </span>
      <div
        className="h-8 w-1.5 rounded-full bg-surface-container-highest overflow-hidden flex flex-col justify-end"
        title={`${hour.sunMinutes} min zon`}
      >
        <div
          className="w-full bg-secondary rounded-full"
          style={{ height: `${sunPct}%` }}
        />
      </div>
      {hour.precip > 0 ? (
        // Regen toont al bovenaan via het conditie-icoon; hier enkel de mm.
        <span className="text-[9px] text-tertiary font-medium">
          {hour.precip}mm
        </span>
      ) : (
        <span className="text-[9px] text-on-surface-variant">
          {hour.sunMinutes}m
        </span>
      )}
    </div>
  );
}
