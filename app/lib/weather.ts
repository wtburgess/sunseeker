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

/** Eén uur uit een dag (voor het uur-detail dat op aanvraag wordt geladen). */
export type HourForecast = {
  time: string; // ISO "2026-06-26T14:00"
  hour: number; // 0–23
  temp: number;
  cloud: number; // %
  precip: number; // mm
  precipProb: number; // % kans
  code: number; // WMO (per uur betrouwbaar)
  sunMinutes: number; // minuten zon in dit uur (0–60)
  isDay: boolean; // daglicht of nacht
  windBft: number; // windkracht (Beaufort)
  windDir: number; // windrichting (graden, waar de wind vandaan komt)
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

/** Lichte dagverwachting per plaats, voor de kaart-tijdlijn en het filter. */
export type DayLite = {
  date: string;
  tMax: number;
  precip: number; // mm over de hele dag
  sunHours: number; // zonuren
  sunFraction: number;
  code: number;
};

/** Meerdaagse dagverwachting (lite) voor meerdere plaatsen, gebatcht. */
export async function fetchDailies(
  points: LatLon[],
  days: number,
): Promise<DayLite[][]> {
  const forecasts = await fetchForecasts(points, days);
  return forecasts.map((f) =>
    f.map((d) => ({
      date: d.date,
      tMax: d.tMax,
      precip: d.precip,
      sunHours: d.sunHours,
      sunFraction: d.sunFraction,
      code: d.code,
    })),
  );
}

/**
 * Haalt het uur-voor-uur weer op voor één stad en één dag. Wordt pas
 * aangeroepen als de gebruiker een dag uitklapt, dus niet voor alle steden.
 */
export async function fetchHourly(
  point: LatLon,
  date: string,
): Promise<HourForecast[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    `&hourly=temperature_2m,cloud_cover,precipitation,precipitation_probability,` +
    `weather_code,sunshine_duration,is_day,wind_speed_10m,wind_direction_10m` +
    `&start_date=${date}&end_date=${date}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const h = data.hourly;

  return h.time.map((time: string, i: number): HourForecast => ({
    time,
    hour: Number(time.slice(11, 13)),
    temp: h.temperature_2m[i],
    cloud: h.cloud_cover[i] ?? 0,
    precip: h.precipitation[i] ?? 0,
    precipProb: h.precipitation_probability[i] ?? 0,
    code: h.weather_code[i] ?? 0,
    sunMinutes: Math.round((h.sunshine_duration[i] ?? 0) / 60),
    isDay: (h.is_day[i] ?? 0) === 1,
    windBft: windToBeaufort(h.wind_speed_10m[i] ?? 0),
    windDir: h.wind_direction_10m[i] ?? 0,
  }));
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

/** Korte helper: label + icoon (kleur zit in de meerkleurige glyph zelf). */
const cond = (label: string, icon: string): WeatherCondition => ({
  label,
  icon,
  filled: true,
  patch: PATCH.cloud,
  iconColor: "",
});

/** Sneeuw-intensiteit uit de WMO-code (71 licht, 73 matig, 75 zwaar, 77 korrels). */
function snowByCode(code: number): WeatherCondition {
  if (code === 75) return cond("Zware sneeuw", "snow_3");
  if (code === 73) return cond("Matige sneeuw", "snow_2");
  return cond("Lichte sneeuw", "snow_1");
}

export function conditionFromCode(code: number): WeatherCondition {
  if (code === 0) return cond("Onbewolkt", "sky_0");
  if (code === 1) return cond("Overwegend zonnig", "sky_1");
  if (code === 2) return cond("Half bewolkt", "sky_2");
  if (code === 3) return cond("Bewolkt", "sky_3");
  if (code <= 48) return cond("Mist", "foggy");
  if (code <= 55) return cond("Motregen", "drizzle");
  if (code <= 57) return cond("IJzel", "sleet"); // aanvriezende motregen
  if (code <= 65) return cond("Regen", "rain_2");
  if (code <= 67) return cond("IJzel", "sleet"); // aanvriezende regen
  if (code <= 77) return snowByCode(code);
  if (code <= 82) return cond("Buien", "showers");
  if (code <= 86) return cond("Sneeuwbuien", "snow_showers");
  if (code === 95) return cond("Onweer", "storm");
  return cond("Onweer met hagel", "storm_hail"); // 96, 99
}

/**
 * Regenicoon naar intensiteit: meer neerslag → voller icoon (meer druppels).
 * Dag-totalen lopen veel hoger op dan uur-waarden, dus de drempels verschillen.
 */
export function rainIcon(precipMm: number, scale: "day" | "hour"): string {
  const [light, heavy] = scale === "day" ? [2, 10] : [0.4, 2.5];
  if (precipMm < light) return "rain_1";
  if (precipMm < heavy) return "rain_2";
  return "rain_3";
}

/** Regen-conditie met een label naar intensiteit. */
function rainCond(precipMm: number, scale: "day" | "hour"): WeatherCondition {
  const icon = rainIcon(precipMm, scale);
  const label =
    icon === "rain_1" ? "Lichte regen" : icon === "rain_2" ? "Matige regen" : "Veel regen";
  return cond(label, icon);
}

/** Vanaf zoveel mm dag-neerslag telt het als een echte "natte dag". */
const WET_DAY_MM = 1;

/**
 * Conditie (label + icoon) voor één dag. Sneeuw is leidend; bij een natte dag
 * (≥ 1 mm) tonen we het juiste neerslag-type (onweer/hagel, ijzel, motregen,
 * buien of regen naar intensiteit); anders bepaalt het zon-aandeel het beeld.
 */
export function conditionFromDay(day: {
  code: number;
  precip: number;
  sunFraction: number;
}): WeatherCondition {
  const c = day.code;
  if (c >= 71 && c <= 77) return snowByCode(c);
  if (c === 85 || c === 86) return cond("Sneeuwbuien", "snow_showers");

  if (day.precip >= WET_DAY_MM) {
    if (c === 96 || c === 99) return cond("Onweer met hagel", "storm_hail");
    if (c === 95) return cond("Onweer", "storm");
    if (c === 56 || c === 57 || c === 66 || c === 67) return cond("IJzel", "sleet");
    if (c >= 51 && c <= 55) return cond("Motregen", "drizzle");
    if (c >= 80 && c <= 82) {
      if (day.sunFraction >= 0.5) return cond("Zonnige bui", "sun_shower");
      if (day.sunFraction >= 0.3) return cond("Buien", "showers");
    }
    return rainCond(day.precip, "day");
  }

  if (day.sunFraction >= 0.85) return cond("Onbewolkt", "sky_0");
  if (day.sunFraction >= 0.6) return cond("Overwegend zonnig", "sky_1");
  if (day.sunFraction >= 0.35) return cond("Half bewolkt", "sky_2");
  if (c === 45 || c === 48) return cond("Mist", "foggy");
  return cond("Bewolkt", "sky_3");
}

/**
 * Conditie voor één uur (overdag). Per-uur WMO-code is betrouwbaar en leidend;
 * regen schaalt met de neerslag van dat uur.
 */
export function conditionFromHour(hour: {
  code: number;
  precip: number;
  sunMinutes: number;
}): WeatherCondition {
  const c = hour.code;
  if (c >= 45) {
    if (c === 45 || c === 48) return cond("Mist", "foggy");
    if (c === 96 || c === 99) return cond("Onweer met hagel", "storm_hail");
    if (c === 95) return cond("Onweer", "storm");
    if (c === 56 || c === 57 || c === 66 || c === 67) return cond("IJzel", "sleet");
    if (c >= 51 && c <= 55) return cond("Motregen", "drizzle");
    if (c >= 71 && c <= 77) return snowByCode(c);
    if (c === 85 || c === 86) return cond("Sneeuwbuien", "snow_showers");
    if (c >= 80 && c <= 82)
      return hour.sunMinutes >= 20
        ? cond("Zonnige bui", "sun_shower")
        : cond("Buien", "showers");
    return rainCond(hour.precip, "hour");
  }
  if (hour.sunMinutes >= 50) return cond("Onbewolkt", "sky_0");
  if (hour.sunMinutes >= 30) return cond("Overwegend zonnig", "sky_1");
  if (hour.sunMinutes >= 10) return cond("Half bewolkt", "sky_2");
  return cond("Bewolkt", "sky_3");
}

/**
 * Zoals conditionFromHour, maar met dag/nacht: 's nachts tonen we maan-varianten
 * (helder, half bewolkt, bewolkt) en maan-met-neerslag (regen/onweer/sneeuw).
 */
export function conditionFromHourDayNight(hour: HourForecast): WeatherCondition {
  if (hour.isDay) return conditionFromHour(hour);

  const c = hour.code;
  if (c >= 45) {
    if (c === 45 || c === 48) return cond("Mist", "foggy");
    if (c >= 95) return cond("Onweer 's nachts", "moon_storm");
    if ((c >= 71 && c <= 77) || c === 85 || c === 86)
      return cond("Sneeuw 's nachts", "moon_snow");
    return cond("Regen 's nachts", "moon_rain");
  }
  if (hour.cloud < 30) return cond("Heldere nacht", "moon");
  if (hour.cloud < 70) return cond("Half bewolkte nacht", "moon_partly");
  return cond("Bewolkte nacht", "moon_cloud");
}

/* ── Actueel weer (nu) ─────────────────────────────────────────────────── */
/** Het weer op dit moment voor één locatie. */
export type CurrentWeather = {
  code: number; // WMO
  temp: number; // °C
  precip: number; // mm (laatste uur)
  isDay: boolean; // daglicht of nacht
};

/**
 * Korte-termijn regenpunt uit Open-Meteo `minutely_15` (15-minuten resolutie —
 * de fijnste die de gratis API biedt; echte 1-minuut data is betaald).
 */
export type MinutelyForecast = {
  time: string; // lokale kloktijd van de plaats "2026-07-17T14:30" (geen offset)
  minute: number; // minuten vanaf nu (0, 15, 30, 45, 60…) — voor de grafiek
  precip: number; // mm in dat kwartier (× 4 = intensiteit mm/u)
  precipProb: number; // % kans (niet beschikbaar op 15-min → 0)
};

/** Eén uur uit de verlengde regenverwachting (na het eerste, minuut-fijne uur). */
export type HourlyRain = {
  time: string; // ISO tijd "2026-07-17T16:00"
  hoursAhead: number; // 1, 2, 3… vanaf nu
  precip: number; // mm in dat uur (= intensiteit mm/u)
  precipProb: number; // % kans
};

/** Korte-termijn regenvoorspelling: volgend uur (per 15 min) + uurlijks daarna. */
export type MinutelyData = {
  now: MinutelyForecast;
  nextHour: MinutelyForecast[]; // kwartier-punten binnen ± het volgende uur
  nextHours: HourlyRain[]; // uurlijkse neerslag ná het eerste uur
};

/** Haalt het weer-op-dit-moment op voor één punt (Open-Meteo `current`). */
export async function fetchCurrent(point: LatLon): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    `&current=temperature_2m,precipitation,weather_code,is_day&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const c = data.current ?? {};
  return {
    code: c.weather_code ?? 0,
    temp: c.temperature_2m ?? 0,
    precip: c.precipitation ?? 0,
    isDay: (c.is_day ?? 1) === 1,
  };
}

/** Actueel weer voor meerdere punten in één keer (gebatcht + gechunkt). */
async function fetchCurrentChunk(points: LatLon[]): Promise<CurrentWeather[]> {
  const lat = points.map((p) => p.lat).join(",");
  const lon = points.map((p) => p.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,weather_code,is_day&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const list = Array.isArray(data) ? data : [data];
  return list.map((entry): CurrentWeather => {
    const c = entry.current ?? {};
    return {
      code: c.weather_code ?? 0,
      temp: c.temperature_2m ?? 0,
      precip: c.precipitation ?? 0,
      isDay: (c.is_day ?? 1) === 1,
    };
  });
}

/** Haalt het actuele weer op voor een lijst punten (volgorde blijft behouden). */
export async function fetchCurrents(
  points: LatLon[],
): Promise<CurrentWeather[]> {
  if (points.length === 0) return [];
  const chunks: LatLon[][] = [];
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    chunks.push(points.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(chunks.map(fetchCurrentChunk));
  return results.flat();
}

/** Aantal uurlijkse punten ná het eerste (kwartier-fijne) uur. */
const RAIN_EXTRA_HOURS = 7;
/** Aantal kwartier-punten in het korte-termijn deel (nu … +60 min). */
const RAIN_QUARTERS = 5;

/**
 * Haalt de regenverwachting op: het volgende uur per 15 minuten (Open-Meteo
 * `minutely_15`) plus de ~7 uren daarna uurlijks (samen ~8 u vooruit). Beide in
 * één API-call.
 */
export async function fetchMinutelyForecast(point: LatLon): Promise<MinutelyData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    `&minutely_15=precipitation` +
    `&hourly=precipitation,precipitation_probability&forecast_days=2&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const nowMs = Date.now();

  // Open-Meteo geeft met `timezone=auto` de tijden in de lokale tijd van de
  // plaats, zónder offset-marker (bv. "2026-07-18T09:45"). `new Date(...)` zou
  // die als de tijd van dít toestel lezen — fout zodra de plaats in een andere
  // tijdzone ligt. Daarom rekenen we via `utc_offset_seconds` naar de echte
  // absolute epoch (voor het filteren), en houden we de lokale tijdstring aan
  // voor de weergave (de grafiek toont zo de lokale kloktijd van de plaats).
  const offsetSec: number = data.utc_offset_seconds ?? 0;
  const toMs = (local: string) => Date.parse(`${local}Z`) - offsetSec * 1000;

  // Korte termijn: kwartier-punten vanaf het lopende kwartier tot +60 min.
  const mq = data.minutely_15 ?? { time: [], precipitation: [] };
  const raw: { tMs: number; local: string; precip: number }[] = [];
  for (let i = 0; i < (mq.time?.length ?? 0); i++) {
    const tMs = toMs(mq.time[i]);
    if (tMs + 15 * 60 * 1000 <= nowMs) continue; // volledig voorbij
    raw.push({ tMs, local: mq.time[i], precip: mq.precipitation?.[i] ?? 0 });
    if (raw.length >= RAIN_QUARTERS) break;
  }
  const base0 = raw.length ? raw[0].tMs : nowMs;
  const nextHour: MinutelyForecast[] = raw.map((q) => ({
    time: q.local, // lokale kloktijd van de plaats
    minute: Math.round((q.tMs - base0) / 60000),
    precip: q.precip, // mm per kwartier
    precipProb: 0,
  }));

  // Uurlijkse neerslag ná het eerste uur: neem de uur-markeringen die minstens
  // ~1 uur in de toekomst liggen, zodat ze niet overlappen met het kwartier-deel.
  const h = data.hourly ?? { time: [], precipitation: [], precipitation_probability: [] };
  const cutoffMs = nowMs + 55 * 60 * 1000; // net vóór +1 u
  const nextHours: HourlyRain[] = [];
  for (let i = 0; i < (h.time?.length ?? 0); i++) {
    if (toMs(h.time[i]) < cutoffMs) continue;
    nextHours.push({
      time: h.time[i],
      hoursAhead: nextHours.length + 1,
      precip: h.precipitation?.[i] ?? 0,
      precipProb: h.precipitation_probability?.[i] ?? 0,
    });
    if (nextHours.length >= RAIN_EXTRA_HOURS) break;
  }

  return {
    now: nextHour[0] ?? { time: mq.time?.[0] ?? "", minute: 0, precip: 0, precipProb: 0 },
    nextHour,
    nextHours,
  };
}

/**
 * Conditie (label + icoon) voor het actuele weer. De huidige WMO-code is
 * betrouwbaar en dus leidend; bij regen schaalt het icoon met de neerslag.
 */
export function conditionFromCurrent(cur: CurrentWeather): WeatherCondition {
  const c = cur.code;
  if (!cur.isDay) {
    // 's Nachts: maan-varianten.
    if (c === 45 || c === 48) return cond("Mist", "foggy");
    if (c >= 95) return cond("Onweer", "moon_storm");
    if ((c >= 71 && c <= 77) || c === 85 || c === 86)
      return cond("Sneeuw", "moon_snow");
    if (c >= 51) return cond("Regen", "moon_rain");
    if (c === 0 || c === 1) return cond("Heldere nacht", "moon");
    if (c === 2) return cond("Half bewolkte nacht", "moon_partly");
    return cond("Bewolkte nacht", "moon_cloud");
  }
  // Overdag: regen schaalt met de actuele neerslag, de rest volgt de code.
  if (c >= 61 && c <= 65) return rainCond(cur.precip, "hour");
  return conditionFromCode(c);
}

/* ── Dag-detail (meerdaagse voorspelling voor één plaats) ──────────────── */
/** Eén dag uit de meerdaagse voorspelling voor het detailoverzicht. */
export type DailyDetail = {
  date: string;
  tMin: number;
  tMax: number;
  sunHours: number; // zonuren
  precip: number; // mm
  precipProb: number; // % kans
  code: number; // WMO
  sunFraction: number; // aandeel zon t.o.v. daglengte (0–1) → voor het icoon
  windBft: number; // windkracht (Beaufort)
  windDir: number; // dominante windrichting (graden, waar de wind vandaan komt)
};

/** Windsnelheid (km/u) → Beaufort. */
export function windToBeaufort(kmh: number): number {
  const upper = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  for (let b = 0; b < upper.length; b++) if (kmh < upper[b]) return b;
  return 12;
}

const DETAIL_VARS =
  "temperature_2m_max,temperature_2m_min,precipitation_sum," +
  "precipitation_probability_max,sunshine_duration,daylight_duration," +
  "weather_code,wind_speed_10m_max,wind_direction_10m_dominant";

/** Haalt de meerdaagse voorspelling met alle detailvelden op voor één plaats. */
export async function fetchDailyDetail(
  point: LatLon,
  days: number,
): Promise<DailyDetail[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    `&daily=${DETAIL_VARS}&forecast_days=${days}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const d = data.daily;
  return d.time.map((date: string, i: number): DailyDetail => {
    const sunSec = d.sunshine_duration[i] ?? 0;
    const dayLight = d.daylight_duration[i] ?? 0;
    return {
      date,
      tMin: Math.round(d.temperature_2m_min[i]),
      tMax: Math.round(d.temperature_2m_max[i]),
      sunHours: sunSec / 3600,
      precip: d.precipitation_sum[i] ?? 0,
      precipProb: d.precipitation_probability_max[i] ?? 0,
      code: d.weather_code[i] ?? 0,
      sunFraction: dayLight > 0 ? clamp(sunSec / dayLight, 0, 1) : 0,
      windBft: windToBeaufort(d.wind_speed_10m_max[i] ?? 0),
      windDir: d.wind_direction_10m_dominant[i] ?? 0,
    };
  });
}

/* ── Orkestratie ───────────────────────────────────────────────────────── */
/**
 * Scoort een opgegeven lijst steden: haalt hun forecast op, scoort de reis en
 * sorteert van beste naar slechtste match. Wordt gebruikt door planTrip én door
 * het zoom-gedreven bijladen op de kaart.
 */
export async function scoreCities(
  cities: City[],
  origin: LatLon,
  prefs: Preferences,
): Promise<ScoredCity[]> {
  if (cities.length === 0) return [];

  const forecasts = await fetchForecasts(cities, prefs.tripDays);

  const scored: ScoredCity[] = cities.map((city, i) => {
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
      distanceKm: distanceKm(origin, city),
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

/**
 * Plant een reis: filtert de grote steden op afstand (overzicht) en scoort de
 * top. De kaart laadt bij het inzoomen kleinere plaatsen bij via scoreCities.
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
    .slice(0, MAX_CANDIDATES)
    .map((c) => c.city);

  return scoreCities(candidates, origin, prefs);
}
