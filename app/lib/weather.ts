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

/** Lichte dagverwachting per plaats, voor de kaart-tijdlijn (icoon + max-temp). */
export type DayLite = {
  date: string;
  tMax: number;
  precip: number;
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

export function conditionFromCode(code: number): WeatherCondition {
  if (code === 0)
    return {
      label: "Onbewolkt",
      icon: "sky_0",
      filled: true,
      patch: PATCH.sun,
      iconColor: "text-secondary",
    };
  if (code === 1)
    return {
      label: "Overwegend zonnig",
      icon: "sky_1",
      filled: true,
      patch: PATCH.sun,
      iconColor: "text-secondary",
    };
  if (code === 2)
    return {
      label: "Half bewolkt",
      icon: "sky_2",
      filled: true,
      patch: PATCH.partly,
      iconColor: "text-secondary",
    };
  if (code === 3)
    return {
      label: "Bewolkt",
      icon: "sky_3",
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
    icon: "storm",
    filled: true,
    patch: PATCH.storm,
    iconColor: "text-error",
  };
}

/** Goudgele tint voor (bijna) volle zon. */
const SUN_GOLD = "text-[#f5a623]";

/** WMO-codes die regen/motregen/buien zijn (geen sneeuw of onweer). */
const isRainCode = (c: number) =>
  (c >= 51 && c <= 67) || (c >= 80 && c <= 82);

/**
 * Regenicoon naar intensiteit: meer neerslag → voller icoon (meer streepjes).
 * Dag-totalen lopen veel hoger op dan uur-waarden, dus de drempels verschillen:
 * een dag met 2 mm is "heel weinig", een uur met 2 mm is al een flinke bui.
 */
export function rainIcon(precipMm: number, scale: "day" | "hour"): string {
  const [light, heavy] = scale === "day" ? [2, 10] : [0.4, 2.5];
  if (precipMm < light) return "rain_1"; // heel weinig: één streepje
  if (precipMm < heavy) return "rain_2"; // matig: twee streepjes
  return "rain_3"; // veel regen: drie streepjes
}

/** Vanaf zoveel mm dag-neerslag telt het als een echte "natte dag". */
const WET_DAY_MM = 1;

/**
 * Conditie (label + icoon) voor één dag. De dagelijkse WMO-code is onbetrouwbaar
 * als headline: hij pakt het zwaarste moment van het etmaal, waardoor een korte
 * nachtbui een verder zonnige dag als "onweer" of "bewolkt" bestempelt. Daarom:
 * sneeuw is altijd leidend; bij noemenswaardige neerslag (≥ 1 mm) tonen we
 * onweer of regen-intensiteit; en bij een vrijwel droge dag bepaalt het werkelijke
 * zon-aandeel het beeld (volle zon wordt goudgeel). De uur-strip toont een korte
 * bui of onweer alsnog op het juiste uur.
 */
export function conditionFromDay(day: {
  code: number;
  precip: number;
  sunFraction: number;
}): WeatherCondition {
  // Sneeuw blijft altijd leidend.
  if ((day.code >= 71 && day.code <= 77) || (day.code >= 85 && day.code <= 86))
    return conditionFromCode(day.code);

  // Echte natte dag: onweer (code ≥ 95) of regen naar intensiteit.
  if (day.precip >= WET_DAY_MM) {
    if (day.code >= 95) return conditionFromCode(day.code); // onweer
    const base = conditionFromCode(isRainCode(day.code) ? day.code : 63);
    return { ...base, icon: rainIcon(day.precip, "day") };
  }

  // Vrijwel droog: het zon-aandeel bepaalt het beeld.
  if (day.sunFraction >= 0.85)
    return { ...conditionFromCode(0), iconColor: SUN_GOLD }; // volle zon
  if (day.sunFraction >= 0.6) return conditionFromCode(1); // Overwegend zonnig
  if (day.sunFraction >= 0.35) return conditionFromCode(2); // Half bewolkt

  // Weinig zon en toch droog: mist (indien zo gecodeerd) of bewolkt.
  if (day.code === 45 || day.code === 48) return conditionFromCode(day.code);
  return conditionFromCode(3); // Bewolkt
}

/**
 * Conditie voor één uur. Per-uur WMO-code is betrouwbaar, dus die is leidend;
 * regen schaalt met de neerslag van dat uur en een zonnig uur wordt goudgeel.
 */
export function conditionFromHour(hour: {
  code: number;
  precip: number;
  sunMinutes: number;
}): WeatherCondition {
  if (hour.code >= 45) {
    const base = conditionFromCode(hour.code);
    return isRainCode(hour.code)
      ? { ...base, icon: rainIcon(hour.precip, "hour") }
      : base;
  }
  if (hour.sunMinutes >= 50)
    return { ...conditionFromCode(0), iconColor: SUN_GOLD }; // bijna vol zon
  if (hour.sunMinutes >= 30) return conditionFromCode(1); // Overwegend zonnig
  if (hour.sunMinutes >= 10) return conditionFromCode(2); // Half bewolkt
  return conditionFromCode(3); // Bewolkt
}

/**
 * Zoals conditionFromHour, maar met dag/nacht: 's nachts tonen we maan-iconen
 * (op basis van de bewolking) i.p.v. een zonnetje. Neerslag/onweer/sneeuw blijven
 * dag én nacht dezelfde iconen.
 */
export function conditionFromHourDayNight(hour: HourForecast): WeatherCondition {
  // Neerslag/onweer/sneeuw: dag én nacht dezelfde iconen. Overdag: zon-logica.
  if (hour.code >= 45 || hour.isDay) return conditionFromHour(hour);

  // Nacht en droog: altijd een maan (helder of maan-met-wolk), nooit een kale
  // dag-wolk, zodat de nacht duidelijk als nacht leesbaar is.
  const clear = hour.cloud < 40;
  return {
    label: clear ? "Heldere nacht" : "Bewolkte nacht",
    icon: clear ? "moon" : "moon_cloud",
    filled: true,
    patch: clear ? PATCH.cloud : PATCH.partly,
    iconColor: "text-outline",
  };
}

/* ── Actueel weer (nu) ─────────────────────────────────────────────────── */
/** Het weer op dit moment voor één locatie. */
export type CurrentWeather = {
  code: number; // WMO
  temp: number; // °C
  precip: number; // mm (laatste uur)
};

/** Haalt het weer-op-dit-moment op voor één punt (Open-Meteo `current`). */
export async function fetchCurrent(point: LatLon): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    `&current=temperature_2m,precipitation,weather_code&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);

  const data = await res.json();
  const c = data.current ?? {};
  return {
    code: c.weather_code ?? 0,
    temp: c.temperature_2m ?? 0,
    precip: c.precipitation ?? 0,
  };
}

/** Actueel weer voor meerdere punten in één keer (gebatcht + gechunkt). */
async function fetchCurrentChunk(points: LatLon[]): Promise<CurrentWeather[]> {
  const lat = points.map((p) => p.lat).join(",");
  const lon = points.map((p) => p.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,weather_code&timezone=auto`;

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

/**
 * Conditie (label + icoon) voor het actuele weer. De huidige WMO-code is
 * betrouwbaar en dus leidend; bij regen schaalt het icoon met de neerslag.
 */
export function conditionFromCurrent(cur: CurrentWeather): WeatherCondition {
  if ((cur.code >= 71 && cur.code <= 77) || (cur.code >= 85 && cur.code <= 86))
    return conditionFromCode(cur.code); // sneeuw
  if (cur.code >= 95) return conditionFromCode(cur.code); // onweer
  if (isRainCode(cur.code))
    return { ...conditionFromCode(cur.code), icon: rainIcon(cur.precip, "hour") };
  return conditionFromCode(cur.code);
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
