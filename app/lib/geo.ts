export type LatLon = { lat: number; lon: number };

export type GeocodeResult = LatLon & {
  name: string;
  country: string;
};

/** Zet een plaatsnaam om naar coördinaten via de Open-Meteo Geocoding API. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=1&language=nl&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding gaf status ${res.status}`);

  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) return null;

  return {
    name: hit.name,
    country: hit.country ?? "",
    lat: hit.latitude,
    lon: hit.longitude,
  };
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
