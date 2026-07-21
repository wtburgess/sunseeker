export type LatLon = { lat: number; lon: number };

export type GeocodeResult = LatLon & {
  id: string;
  name: string;
  country: string;
  /** Regio/provincie/departement — helpt gelijknamige plaatsen onderscheiden. */
  admin1?: string;
};

/** Zet één rauwe Open-Meteo-hit om naar een GeocodeResult. */
function toResult(hit: {
  id?: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}): GeocodeResult {
  return {
    id: String(hit.id ?? `${hit.latitude},${hit.longitude}`),
    name: hit.name,
    country: hit.country ?? "",
    admin1: hit.admin1 ?? "",
    lat: hit.latitude,
    lon: hit.longitude,
  };
}

/** Zet een plaatsnaam om naar coördinaten via de Open-Meteo Geocoding API. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const list = await geocodeSuggest(query, 1);
  return list[0] ?? null;
}

/** Eén Open-Meteo-zoekopdracht op een exacte tekst. */
async function fetchGeo(
  name: string,
  count: number,
): Promise<GeocodeResult[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
    `&count=${count}&language=nl&format=json`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return [];
  const data = await res.json();
  const results = (data.results ?? []) as Parameters<typeof toResult>[0][];
  return results.map(toResult);
}

/**
 * Scheidingsteken-varianten van de invoer. Open-Meteo matcht enkel op de
 * letterlijke naam, dus "belle ile" vindt alleen plaatsen die écht "Belle Ile"
 * heten (Canada), niet "Belle-Île-en-Mer". Door óók de spatie→streepje- en
 * streepje→spatie-variant te proberen, komt de juiste plaats alsnog boven.
 */
function queryVariants(q: string): string[] {
  const variants = [q];
  if (/\s/.test(q)) variants.push(q.replace(/\s+/g, "-"));
  if (/-/.test(q)) variants.push(q.replace(/-+/g, " "));
  return [...new Set(variants)];
}

/**
 * Geeft een shortlist van plaatsen die bij de (deel)invoer passen, voor de
 * type-ahead. Doet een lichte "fuzzy" zoekactie door scheidingsteken-varianten
 * (spatie/streepje) parallel op te vragen en de treffers om beurten samen te
 * voegen, zodat "belle ile", "belle-ile" én "belle ile en mer" allemaal bij
 * Belle-Île-en-Mer uitkomen. De resultaten dragen hun coördinaten mee, zodat
 * een aangetikt voorstel geen tweede zoekopdracht meer nodig heeft.
 */
export async function geocodeSuggest(
  query: string,
  count = 6,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const lists = await Promise.all(
    queryVariants(q).map((v) => fetchGeo(v, count)),
  );

  // Om beurten uit elke variant plukken (round-robin) en op id ontdubbelen, zo
  // staat de beste treffer van elke variant vooraan.
  const seen = new Set<string>();
  const merged: GeocodeResult[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const r = list[i];
      if (r && !seen.has(r.id)) {
        seen.add(r.id);
        merged.push(r);
      }
    }
  }
  return merged.slice(0, count);
}

/**
 * Zet coördinaten om naar een plaatsnaam (reverse geocoding via BigDataCloud —
 * gratis, geen sleutel, CORS-vriendelijk). Geeft null als er niets bruikbaars is.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client?` +
    `latitude=${lat}&longitude=${lon}&localityLanguage=nl`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const d = await res.json();
  const place = d.city || d.locality || d.principalSubdivision;
  return place || null;
}

/**
 * Benaderende locatie via het IP-adres (ipwho.is — gratis, geen sleutel, CORS-
 * vriendelijk, HTTPS). Stads-nauwkeurig en zónder toestemmingsvraag, handig als
 * de toestellocatie uitstaat. Geeft null bij mislukking.
 */
export async function fetchIpLocation(): Promise<{
  lat: number;
  lon: number;
  name: string;
} | null> {
  try {
    const res = await fetch("https://ipwho.is/");
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.success === false || typeof d.latitude !== "number") return null;
    return {
      lat: d.latitude,
      lon: d.longitude,
      name: d.city || d.region || d.country || "Mijn locatie",
    };
  } catch {
    return null;
  }
}

/** Afstand in kilometer tussen twee punten (Haversine). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
