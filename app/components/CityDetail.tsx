"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { HourDetail } from "./HourDetail";
import { RainButton } from "./RainButton";
import {
  conditionFromDay,
  fetchDailyDetail,
  type DailyDetail,
} from "../lib/weather";
import { distanceKm } from "../lib/geo";

/** Aantal dagen in het detailoverzicht. */
const DAYS = 14;

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "short" });
const fmtDayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
/** Eén decimaal, Belgische notatie (komma). */
const nl1 = (n: number) =>
  n.toLocaleString("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/** Volledig detailoverzicht per dag voor één plaats (opent over de kaart). */
export function CityDetail({
  place,
  reference,
  isFavorite,
  onToggleFavorite,
  onOpenLegend,
  onStory,
  onClose,
}: {
  place: { name: string; lat: number; lon: number };
  reference?: { name: string; lat: number; lon: number } | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenLegend: () => void;
  onStory: () => void;
  onClose: () => void;
}) {
  // Afstand tot de referentiestad (het kaartmiddelpunt / gezochte plaats).
  // Enkel tonen als die er is én een andere plaats is dan deze.
  const dist =
    reference && distanceKm(place, reference) > 0
      ? distanceKm(place, reference)
      : null;

  // Opent de standaard routeplanner met een route naar deze bekeken plaats.
  // We laten het startpunt weg, zodat de routeplanner altijd de huidige locatie
  // van het toestel als vertrek gebruikt. Op iOS Apple Maps, elders Google Maps.
  const openRoute = () => {
    const to = `${place.lat},${place.lon}`;
    const isIOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${to}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${to}&travelmode=driving`;
    window.open(url, "_blank", "noopener");
  };
  const [days, setDays] = useState<DailyDetail[] | null>(null);
  const [error, setError] = useState(false);
  // Aangeklikte dag → uur-detail (over de daglijst).
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDays(null);
    setError(false);
    fetchDailyDetail(place, DAYS)
      .then((d) => active && setDays(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [place]);

  return (
    <div className="absolute inset-0 z-[1200] bg-surface flex flex-col animate-fade-in">
      {/* Kop */}
      <div className="flex items-center gap-1 px-3 h-14 shrink-0 border-b-2 border-outline-variant">
        <button
          onClick={onClose}
          aria-label="Terug naar kaart"
          className="w-10 h-10 -ml-2 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="arrow_back" className="text-[24px]" />
        </button>
        <h2 className="flex-grow font-headline-md text-headline-md uppercase tracking-wide truncate">
          {place.name}
        </h2>
        <button
          onClick={onToggleFavorite}
          aria-label={
            isFavorite ? "Verwijder uit favorieten" : "Bewaar als favoriet"
          }
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon
            name="favorite"
            filled={isFavorite}
            className={`text-[24px] ${
              isFavorite ? "text-[#d1495b]" : "text-outline"
            }`}
          />
        </button>
        <RainButton place={place} />
        <button
          onClick={onStory}
          aria-label="Weerpraatje voor deze plaats"
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="forum" className="text-[24px] text-primary" />
        </button>
        <button
          onClick={onOpenLegend}
          aria-label="Uitleg weericonen"
          className="w-10 h-10 -mr-1 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="info" className="text-[24px] text-primary" />
        </button>
      </div>

      {/* Afstand tot de referentiestad + knop naar de routeplanner. */}
      {dist != null && reference && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b-2 border-outline-variant">
          <span className="text-[15px] text-on-surface-variant">
            Afstand tot {reference.name}:{" "}
            <span className="font-semibold text-on-surface">{dist} km</span>
          </span>
          <button
            onClick={openRoute}
            aria-label={`Route naar ${reference.name}`}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-headline-sm text-[14px] uppercase active-press"
          >
            <Icon name="directions" filled className="text-[20px]" />
            Route
          </button>
        </div>
      )}

      {/* Lijst per dag */}
      <div className="flex-grow overflow-y-auto">
        {error ? (
          <p className="p-4 text-error font-label-lg text-label-lg flex items-center gap-2">
            <Icon name="error" filled /> Kon het weer niet laden.
          </p>
        ) : !days ? (
          <div className="flex items-center justify-center h-full gap-2 text-outline font-label-lg text-label-lg uppercase tracking-widest">
            <Icon name="progress_activity" className="animate-spin" /> Laden…
          </div>
        ) : (
          <ul>
            {days.map((d) => (
              <DayRow key={d.date} d={d} onOpen={setOpenDate} />
            ))}
          </ul>
        )}
      </div>

      {openDate && (
        <HourDetail
          place={place}
          date={openDate}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onOpenLegend={onOpenLegend}
          onClose={() => setOpenDate(null)}
        />
      )}
    </div>
  );
}

function DayRow({
  d,
  onOpen,
}: {
  d: DailyDetail;
  onOpen: (date: string) => void;
}) {
  const cond = conditionFromDay(d);
  const hasRain = d.precip > 0;
  const hasProb = d.precipProb > 0;
  return (
    <li className="border-b border-outline-variant">
      <button
        onClick={() => onOpen(d.date)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-container-high/60 active-press"
      >
        {/* Dag + datum */}
        <div className="w-12 shrink-0 leading-none">
          <div className="font-headline-sm text-[19px] capitalize">
            {fmtWeekday(d.date)}
          </div>
          <div className="text-[13px] text-outline mt-0.5">
            {fmtDayMonth(d.date)}
          </div>
        </div>

        {/* Weericoon */}
        <Icon
          name={cond.icon}
          filled={cond.filled}
          className={`text-[38px] shrink-0 ${cond.iconColor}`}
        />

        {/* Max (fel) boven min (gedempt) */}
        <div className="w-12 shrink-0 text-right leading-none">
          <div className="text-[22px] font-bold text-primary">{d.tMax}°</div>
          <div className="text-[15px] text-on-surface-variant mt-0.5">
            {d.tMin}°
          </div>
        </div>

        {/* Zon + (enkel bij neerslag) kans/mm */}
        <div className="flex-grow min-w-0 pl-1 flex flex-col gap-1 text-[15px] text-on-surface-variant leading-none">
          <span className="flex items-center gap-1">
            <Icon name="sunny" filled className="text-[18px] text-secondary" />
            {nl1(d.sunHours)} u
          </span>
          {hasRain && (
            <span className="flex items-center gap-2.5">
              {hasProb && (
                <span className="flex items-center gap-0.5">
                  <Icon name="water_drop" className="text-[18px]" />
                  {Math.round(d.precipProb)}%
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <Icon name="rainy" className="text-[18px]" />
                {nl1(d.precip)}mm
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
            style={{ transform: `rotate(${d.windDir + 180}deg)` }}
          />
          <span className="text-[12px] mt-0.5">{d.windBft} Bft</span>
        </div>

        {/* Verder-pijltje: klik door naar de uur-lijst. */}
        <Icon name="chevron_right" className="text-[26px] shrink-0 -mr-1 text-outline" />
      </button>
    </li>
  );
}
