import citiesData from "./cities.json";

export type City = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

/** ~750 Europese steden (>100k inwoners), gesorteerd op inwonertal.
 *  Gegenereerd uit GeoNames cities15000 — zie /tmp/build_cities.py. */
export const CITIES = citiesData as City[];
