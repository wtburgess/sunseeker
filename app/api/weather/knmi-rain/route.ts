import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Eén tijdvak uit de regenverwachting. Zelfde vorm als `RainPoint` in
 * `app/lib/weather.ts`: het fijne deel (5 min) en de uren erna verschillen
 * enkel in `spanMinutes`, zodat de client beide op één schaal kan zetten.
 */
interface RainPoint {
  time: string; // lokale kloktijd "2026-08-28T14:35" (geen offset-marker)
  minutesAhead: number; // minuten vanaf nu tot het begin van dit tijdvak
  spanMinutes: number; // 5 (radar) of 60 (uur)
  precip: number; // mm in dat tijdvak
  precipProb: number; // % kans (radar geeft die niet → 0)
}

/** Intern: hetzelfde punt, met de echte epoch erbij om op te kunnen rekenen. */
type TimedPoint = RainPoint & { startMs: number };

interface NowcastData {
  now: RainPoint;
  nextHour: RainPoint[];
  nextHours: RainPoint[];
  hasBuienradar: boolean;
}

/**
 * Buienradar geeft de tijden in Nederlandse kloktijd, ongeacht waar de server
 * staat en ook voor Belgische coördinaten — België loopt op dezelfde klok.
 */
const NL_TZ = "Europe/Amsterdam";

/** Nederlandse kloktijd van dit moment + de bijhorende UTC-offset. */
function dutchNow(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: NL_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const hour = Number(parts.hour) % 24; // "24:00" komt voor bij middernacht
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return {
    date, // "2026-08-28"
    minutesOfDay: hour * 60 + Number(parts.minute),
    offsetSec: Math.round((asUtc - at.getTime()) / 1000),
  };
}

/** Eén dag later, als kale datumstring. */
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/**
 * Buienradar geeft de neerslag op een schaal van 0–255, niet in millimeters.
 * De officiële omrekening is logaritmisch: waarde 109 is 1 mm/u, elke 32
 * stappen erbij vermenigvuldigt met tien. Lineair delen (zoals eerder) maakte
 * van een lichte bui tientallen millimeters — waardoor het radar-deel van de
 * grafiek niet te vergelijken was met de uurwaarden ernaast.
 */
function buienradarMmPerHour(value: number): number {
  const mmh = Math.pow(10, (value - 109) / 32);
  return mmh < 0.02 ? 0 : mmh; // onder de meetdrempel: droog
}

/**
 * Buienradar-nowcast: 24 punten van 5 minuten, twee uur vooruit. Publieke API,
 * geen sleutel nodig; regels zien eruit als "077|14:35". Het radarbeeld dekt
 * Nederland en België; daarbuiten antwoordt de API met 404 en valt de client
 * terug op Open-Meteo.
 */
async function fetchBuienradar(lat: number, lon: number): Promise<TimedPoint[] | null> {
  try {
    // Trailing slash is verplicht; coördinaten op 2 decimalen.
    const url =
      `https://gpsgadget.buienradar.nl/data/raintext/` +
      `?lat=${Math.round(lat * 100) / 100}&lon=${Math.round(lon * 100) / 100}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.debug(`[Buienradar] HTTP ${res.status}`);
      return null;
    }
    return parseBuienradar(await res.text());
  } catch (err) {
    console.debug("[Buienradar] mislukt:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function parseBuienradar(text: string): TimedPoint[] | null {
  const now = new Date();
  const nl = dutchNow(now);
  const points: TimedPoint[] = [];

  for (const line of text.trim().split("\n")) {
    const [valueStr, timeStr] = line.split("|");
    if (!valueStr || !timeStr) continue;

    const [hh, mm] = timeStr.trim().split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

    // Buienradar geeft alleen HH:MM. De reeks loopt altijd vooruit, dus een
    // tijd die "vroeger" lijkt dan nu hoort bij morgen — zonder die correctie
    // valt de hele grafiek weg zodra de reeks over middernacht heen loopt.
    const minutesOfDay = hh * 60 + mm;
    const minutesAhead = (minutesOfDay - nl.minutesOfDay + 1440) % 1440;
    if (minutesAhead > 130) continue; // ligt achter ons, niet in de toekomst
    const date = minutesOfDay < nl.minutesOfDay ? nextDay(nl.date) : nl.date;

    const time = `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    points.push({
      time,
      startMs: Date.parse(`${time}Z`) - nl.offsetSec * 1000,
      minutesAhead,
      spanMinutes: 5,
      precip: buienradarMmPerHour(Number(valueStr.trim()) || 0) / 12, // mm/u → mm per 5 min
      precipProb: 0,
    });
  }

  points.sort((a, b) => a.minutesAhead - b.minutesAhead);
  return points.length > 0 ? points : null;
}

/**
 * Uurlijkse neerslag van Open-Meteo, voor het deel ná de radar. Zonder
 * `models` kiest Open-Meteo per regio zelf het beste model — in Nederland is
 * dat hetzelfde KNMI-model dat de dag- en uurlijst gebruiken.
 */
async function fetchHourlyTail(
  lat: number,
  lon: number,
  nowMs: number,
  fromMs: number,
): Promise<TimedPoint[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,precipitation_probability&forecast_hours=12&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = await res.json();
  const h = data.hourly ?? {};

  // `timezone=auto` geeft lokale tijden zónder offset-marker; via
  // `utc_offset_seconds` rekenen we naar de echte epoch.
  const offsetSec: number = data.utc_offset_seconds ?? 0;
  const out: TimedPoint[] = [];
  for (let i = 0; i < (h.time?.length ?? 0); i++) {
    const startMs = Date.parse(`${h.time[i]}Z`) - offsetSec * 1000;
    if (startMs < fromMs) continue;
    out.push({
      time: h.time[i],
      startMs,
      minutesAhead: Math.round((startMs - nowMs) / 60000),
      spanMinutes: 60,
      precip: h.precipitation?.[i] ?? 0,
      precipProb: h.precipitation_probability?.[i] ?? 0,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lon = parseFloat(req.nextUrl.searchParams.get("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const radar = await fetchBuienradar(lat, lon);
  if (!radar) {
    // Geen radar: de client haalt zelf de (grovere) Open-Meteo-voorspelling op.
    return NextResponse.json(
      { error: "Buienradar niet beschikbaar, val terug op Open-Meteo" },
      { status: 501 },
    );
  }

  // Naad tussen fijn en uurlijks: het eerste hele uur ná +60 min. Het fijne
  // deel dekt dan altijd minstens het komende uur, en het uur-deel begint er
  // exact op — geen gat en geen dubbeltelling, dus een doorlopende lijn. De
  // naad komt uit de tijdstempels zelf; zelf uren uitrekenen loopt mis op de
  // seconden die er sinds het hele uur voorbij zijn.
  const nowMs = Date.now();
  const nextHours = await fetchHourlyTail(lat, lon, nowMs, nowMs + 60 * 60 * 1000);
  const splitMs = nextHours[0]?.startMs ?? Number.POSITIVE_INFINITY;
  const nextHour = radar.filter((p) => p.startMs < splitMs);

  const strip = (p: TimedPoint): RainPoint => ({
    time: p.time,
    minutesAhead: p.minutesAhead,
    spanMinutes: p.spanMinutes,
    precip: p.precip,
    precipProb: p.precipProb,
  });
  const data: NowcastData = {
    now: strip(nextHour[0] ?? nextHours[0] ?? radar[0]),
    nextHour: nextHour.map(strip),
    nextHours: nextHours.map(strip),
    hasBuienradar: true,
  };
  return NextResponse.json(data);
}
