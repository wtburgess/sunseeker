import type { City } from "../../lib/cities";
import citiesEU from "../../data/citiesEU.json";

/**
 * Bounds-API: geeft de plaatsen (≥ 15.000 inw.) binnen het opgevraagde
 * kaartbeeld terug, gesorteerd op inwonertal. De dataset staat server-side en
 * wordt zo nooit volledig naar de client gestuurd — alleen wat in beeld is.
 *
 * Query: minLat, maxLat, minLon, maxLon, minPop, limit
 */
const ALL = (citiesEU as City[]); // al gesorteerd op population (aflopend)

const num = (v: string | null) => (v === null ? NaN : Number(v));

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const minLat = num(q.get("minLat"));
  const maxLat = num(q.get("maxLat"));
  const minLon = num(q.get("minLon"));
  const maxLon = num(q.get("maxLon"));
  const minPop = num(q.get("minPop")) || 0;
  const limit = Math.min(Math.max(num(q.get("limit")) || 80, 1), 200);

  if ([minLat, maxLat, minLon, maxLon].some(Number.isNaN)) {
    return Response.json([], { status: 400 });
  }

  const out: City[] = [];
  for (const c of ALL) {
    // ALL is aflopend op populatie: zodra we onder minPop zakken, is de rest
    // ook te klein.
    if (c.population < minPop) break;
    if (c.lat < minLat || c.lat > maxLat || c.lon < minLon || c.lon > maxLon) {
      continue;
    }
    out.push(c);
    if (out.length >= limit) break;
  }

  return Response.json(out);
}
