import { CITIES } from "./cities";

export type CountryLabel = { name: string; lat: number; lon: number; pop: number };

/**
 * Eén label per land, geplaatst op het (ongewogen) zwaartepunt van zijn steden
 * uit de dataset. De namen komen al in het Nederlands uit de stedendata
 * (bv. "België", "Duitsland", "Zweden"), dus geen vertaaltabel nodig. Wordt op de
 * kaart getekend bij uitgezoomd niveau, i.p.v. de anderstalige CARTO-labeltegels.
 */
export const COUNTRY_LABELS: CountryLabel[] = (() => {
  const acc = new Map<string, { lat: number; lon: number; n: number; pop: number }>();
  for (const c of CITIES) {
    const e = acc.get(c.country) ?? { lat: 0, lon: 0, n: 0, pop: 0 };
    e.lat += c.lat;
    e.lon += c.lon;
    e.n += 1;
    e.pop += c.population;
    acc.set(c.country, e);
  }
  return [...acc.entries()].map(([name, e]) => ({
    name,
    lat: e.lat / e.n,
    lon: e.lon / e.n,
    pop: e.pop,
  }));
})();
