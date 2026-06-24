import { CITIES, type City } from "./cities";
import { distanceKm, type LatLon } from "./geo";

export type Preferences = {
  /** Minimale gewenste dagtemperatuur in °C. */
  minTemp: number;
  /** Maximale gewenste dagtemperatuur in °C. */
  maxTemp: number;
  wantSun: boolean;
  wantDry: boolean;
  wantSnow: boolean;
  /** Lengte van de reis in dagen (forecast-venster). */
  tripDays: number;
  /** Maximale afstand vanaf het vertrekpunt in km. */
  maxDistanceKm: number;
};

export type WeatherCondition = {
  label: string;
  icon: string;
  filled: boolean;
  /** Tailwind-klassen voor de ronde "patch" (bg + border + text). */
  patch: string;
  /** Tekstkleur voor losse iconen (bv. in het dag-detail). */
  iconColor: string;
};

type DailyForecast = {
  date: string;
  tMax: number;
  precip: number; // mm
  precipProb: number; // %
  cloud: number; // % (24-uurs gemiddelde — incl. nacht, niet getoond)
  sunHours: number; // werkelijke zonuren overdag
  sunFraction: number; // aandeel zon t.o.v. daglengte (0–1)
  code: number; // WMO
};

/** Eén dag uit het reisvenster, inclusief per-dag score en "goed"-vlag. */
export type DayForecast = DailyForecast & {
  score: number; // 0–10 voor deze dag
  good: boolean; // haalt de "goed"-drempel
};

export type ScoredCity = {
  city: City;
  distanceKm: number;
  score: number; // 0–10 (gemiddelde over de hele reis)
  goodDays: number; // aantal goede dagen in het venster
  totalDays: number;
  startDate: string; // ISO-datum eerste dag
  endDate: string; // ISO-datum laatste dag
  avgTempMax: number;
  avgSunHours: number; // gemiddeld aantal zonuren per dag
  totalPrecip: number;
  condition: WeatherCondition;
  days: DayForecast[]; // volledige reisvenster (voor het dag-detail)
};

/** Max. aantal bestemmingen waarvoor we het weer ophalen (grootste steden in bereik). */
const MAX_CANDIDATES = 100;
/** Aantal coördinaten per Open-Meteo request. */
const CHUNK_SIZE = 50;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/* ── Forecast ophalen (gebatcht + gechunkt) ────────────────────────────── */
const DAILY_VARS =
  "temperature_2m_max,precipitation_sum,precipitation_probability_max,cloud_cover_mean,sunshine_duration,daylight_duration,weather_code";

async function fetchForecastChunk(
  points: LatLon[],
  tripDays: number,
): Promise<DailyForecast[][]> {
  const lat = points.map((p) => p.lat).join(",");
  const lon = points.map((p) => p.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${DAILY_VARS}&forecast_days=${tripDays}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const list = Array.isArray(data) ? data : [data];

  return list.map((entry) => {
    const d = entry.daily;
    return d.time.map((date: string, i: number): DailyForecast => {
      const sunSec = d.sunshine_duration[i] ?? 0;
      const dayLightSec = d.daylight_duration[i] ?? 0;
      return {
        date,
        tMax: d.temperature_2m_max[i],
        precip: d.precipitation_sum[i] ?? 0,
        precipProb: d.precipitation_probability_max[i] ?? 0,
        cloud: d.cloud_cover_mean[i] ?? 0,
        sunHours: sunSec / 3600,
        sunFraction: dayLightSec > 0 ? clamp(sunSec / dayLightSec, 0, 1) : 0,
        code: d.weather_code[i] ?? 0,
      };
    });
  });
}

async function fetchForecasts(
  points: LatLon[],
  tripDays: number,
): Promise<DailyForecast[][]> {
  const chunks: LatLon[][] = [];
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    chunks.push(points.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((c) => fetchForecastChunk(c, tripDays)),
  );
  return results.flat();
}

/* ── Scoring ───────────────────────────────────────────────────────────── */
/** Match-score (0–10) voor één dag. */
function scoreDay(day: DailyForecast, prefs: Preferences): number {
  // Temperatuur binnen de gewenste band [minTemp, maxTemp] scoort vol; te koud
  // of te warm wordt evenredig met de afstand tot de band afgestraft.
  let tempScore: number;
  if (day.tMax < prefs.minTemp) {
    tempScore = clamp(10 - (prefs.minTemp - day.tMax) * 1.1, 0, 10); // te koud
  } else if (day.tMax > prefs.maxTemp) {
    tempScore = clamp(10 - (day.tMax - prefs.maxTemp) * 1.1, 0, 10); // te warm
  } else {
    tempScore = 10; // binnen de gewenste band
  }

  // Zon op basis van werkelijke zonuren overdag (aandeel van de daglengte),
  // niet het 24-uurs bewolkingsgemiddelde dat ook de nacht meetelt.
  const sunScore = clamp(day.sunFraction * 10, 0, 10);
  const dryScore = clamp(10 - day.precip * 3 - day.precipProb * 0.04, 0, 10);

  // Sneeuw: echte sneeuwcodes scoren vol; anders telt koude (met neerslag) mee.
  const isSnow =
    (day.code >= 71 && day.code <= 77) || (day.code >= 85 && day.code <= 86);
  const cold = clamp(10 - Math.max(day.tMax, 0) * 1.4, 0, 10);
  const snowScore = isSnow ? 10 : cold * (day.precip > 0 ? 1 : 0.7);

  // Temperatuur (binnen je min–max band) weegt stevig mee; droog blijft het
  // zwaarst. Buiten de band zakt de dagscore daardoor duidelijk.
  const wTemp = 2;
  const wSun = prefs.wantSun ? 2 : 0.6;
  const wDry = prefs.wantDry ? 2.5 : 1.2;
  const wSnow = prefs.wantSnow ? 2.2 : 0;

  return (
    (tempScore * wTemp +
      sunScore * wSun +
      dryScore * wDry +
      snowScore * wSnow) /
    (wTemp + wSun + wDry + wSnow)
  );
}

/** Drempel waarboven een dag als "goed" telt. */
const GOOD_DAY = 6;

/**
 * Scoort de hele reis als het gemiddelde van de dagscores. Meer goede dagen
 * geeft een hogere score, ook als er een slechte dag tussen zit: 3 + regendag
 * + 3 (gem. 8,0) verslaat 5 op een rij + 2 regendagen (gem. 7,0).
 */
function scoreTrip(days: DailyForecast[], prefs: Preferences) {
  const window = days.slice(0, prefs.tripDays);
  const dayScores = window.map((d) => scoreDay(d, prefs));
  const score = dayScores.reduce((a, b) => a + b, 0) / dayScores.length;
  return { window, dayScores, score };
}

function mostCommonCondition(days: DailyForecast[]): WeatherCondition {
  const counts = new Map<string, { cond: WeatherCondition; n: number }>();
  for (const d of days) {
    const cond = conditionFromDay(d);
    const entry = counts.get(cond.label);
    if (entry) entry.n += 1;
    else counts.set(cond.label, { cond, n: 1 });
  }
  let best = conditionFromDay(days[0]);
  let max = 0;
  for (const { cond, n } of counts.values()) {
    if (n > max) {
      max = n;
      best = cond;
    }
  }
  return best;
}

/* ── WMO weather code → label + icoon ──────────────────────────────────── */
const PATCH = {
  sun: "bg-secondary-container border-secondary text-on-secondary-container",
  partly: "bg-surface-container-high border-secondary/60 text-secondary",
  cloud: "bg-surface-container-highest border-outline text-outline",
  rain: "bg-surface-container-high border-tertiary text-tertiary",
  snow: "bg-surface-container-low border-outline text-tertiary",
  storm: "bg-error-container border-error text-error",
};

export function conditionFromCode(code: number): WeatherCondition {
  if (code === 0)
    return {
      label: "Onbewolkt",
      icon: "sunny",
      filled: true,
      patch: PATCH.sun,
      iconColor: "text-secondary",
    };
  if (code === 1)
    return {
      label: "Overwegend zonnig",
      icon: "sunny",
      filled: true,
      patch: PATCH.sun,
      iconColor: "text-secondary",
    };
  if (code === 2)
    return {
      label: "Half bewolkt",
      icon: "partly_cloudy_day",
      filled: true,
      patch: PATCH.partly,
      iconColor: "text-secondary",
    };
  if (code === 3)
    return {
      label: "Bewolkt",
      icon: "cloud",
      filled: true,
      patch: PATCH.cloud,
      iconColor: "text-outline",
    };
  if (code <= 48)
    return {
      label: "Mist",
      icon: "foggy",
      filled: true,
      patch: PATCH.cloud,
      iconColor: "text-outline",
    };
  if (code <= 57)
    return {
      label: "Motregen",
      icon: "rainy",
      filled: true,
      patch: PATCH.rain,
      iconColor: "text-tertiary",
    };
  if (code <= 67)
    return {
      label: "Regen",
      icon: "rainy",
      filled: true,
      patch: PATCH.rain,
      iconColor: "text-tertiary",
    };
  if (code <= 77)
    return {
      label: "Sneeuw",
      icon: "weather_snowy",
      filled: true,
      patch: PATCH.snow,
      iconColor: "text-tertiary",
    };
  if (code <= 82)
    return {
      label: "Buien",
      icon: "rainy",
      filled: true,
      patch: PATCH.rain,
      iconColor: "text-tertiary",
    };
  if (code <= 86)
    return {
      label: "Sneeuwbuien",
      icon: "weather_snowy",
      filled: true,
      patch: PATCH.snow,
      iconColor: "text-tertiary",
    };
  return {
    label: "Onweer",
    icon: "thunderstorm",
    filled: true,
    patch: PATCH.storm,
    iconColor: "text-error",
  };
}

/**
 * Conditie (label + icoon) voor één dag op basis van de werkelijke zonuren.
 * Neerslag, mist, sneeuw en onweer (WMO-code ≥ 45) blijven leidend; voor droge
 * dagen kiezen we zon/half/bewolkt op het zon-aandeel i.p.v. de onbetrouwbare
 * dagelijkse WMO-code (die een zonnige dag soms toch "bewolkt" noemt).
 */
export function conditionFromDay(day: {
  code: number;
  sunFraction: number;
}): WeatherCondition {
  if (day.code >= 45) return conditionFromCode(day.code);
  if (day.sunFraction >= 0.85) return conditionFromCode(0); // Onbewolkt
  if (day.sunFraction >= 0.6) return conditionFromCode(1); // Overwegend zonnig
  if (day.sunFraction >= 0.35) return conditionFromCode(2); // Half bewolkt
  return conditionFromCode(3); // Bewolkt
}

/* ── Orkestratie ───────────────────────────────────────────────────────── */
/**
 * Plant een reis: filtert steden op afstand, haalt de forecast op,
 * scoort de beste stretch en sorteert van beste naar slechtste match.
 */
export async function planTrip(
  origin: LatLon,
  prefs: Preferences,
): Promise<ScoredCity[]> {
  // Kandidaten binnen bereik, gesorteerd op inwonertal (CITIES is al gesorteerd).
  const candidates = CITIES.map((city) => ({
    city,
    dist: distanceKm(origin, city),
  }))
    .filter((c) => c.dist <= prefs.maxDistanceKm)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) return [];

  const forecasts = await fetchForecasts(
    candidates.map((c) => c.city),
    prefs.tripDays,
  );

  const scored: ScoredCity[] = candidates.map(({ city, dist }, i) => {
    const { window, dayScores, score } = scoreTrip(forecasts[i], prefs);
    const avg = (sel: (d: DailyForecast) => number) =>
      window.reduce((a, d) => a + sel(d), 0) / window.length;

    const days: DayForecast[] = window.map((d, idx) => ({
      ...d,
      score: Math.round(clamp(dayScores[idx], 0, 10) * 10) / 10,
      good: dayScores[idx] >= GOOD_DAY,
    }));

    return {
      city,
      distanceKm: dist,
      score: Math.round(clamp(score, 0, 10) * 10) / 10,
      goodDays: days.filter((d) => d.good).length,
      totalDays: window.length,
      startDate: window[0].date,
      endDate: window[window.length - 1].date,
      avgTempMax: Math.round(avg((d) => d.tMax)),
      avgSunHours: Math.round(avg((d) => d.sunHours)),
      totalPrecip: Math.round(window.reduce((a, d) => a + d.precip, 0) * 10) / 10,
      condition: mostCommonCondition(window),
      days,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
