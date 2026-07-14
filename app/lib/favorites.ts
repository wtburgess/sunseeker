/**
 * Favoriete plaatsen, bewaard in de browser (localStorage) — geen account of
 * server nodig. Per apparaat/browser dus, en weg als de gebruiker zijn
 * browsergegevens wist. Een favoriet is enkel naam + coördinaten, zodat er
 * geen tweede zoekopdracht nodig is om er heen te springen.
 */
export type Favorite = { name: string; lat: number; lon: number };

const KEY = "sunseeker:favorites";

/** Identiteit van een favoriet: naam + (grof) afgeronde coördinaten, zodat
 *  gelijknamige plaatsen (bv. twee "Paris") toch los van elkaar blijven. */
const keyOf = (f: Favorite) =>
  `${f.name}@${f.lat.toFixed(2)},${f.lon.toFixed(2)}`;

export function loadFavorites(): Favorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Favorite[]) : [];
  } catch {
    return [];
  }
}

function persist(list: Favorite[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Opslag kan geweigerd of vol zijn; stil falen — favorieten zijn optioneel.
  }
}

export function isFavorite(list: Favorite[], fav: Favorite): boolean {
  const k = keyOf(fav);
  return list.some((f) => keyOf(f) === k);
}

/** Voegt de plaats toe of haalt hem weg (afhankelijk of hij er al in zit). */
export function toggleFavorite(list: Favorite[], fav: Favorite): Favorite[] {
  const k = keyOf(fav);
  const next = list.some((f) => keyOf(f) === k)
    ? list.filter((f) => keyOf(f) !== k)
    : [...list, fav];
  persist(next);
  return next;
}

export function removeFavorite(list: Favorite[], fav: Favorite): Favorite[] {
  const k = keyOf(fav);
  const next = list.filter((f) => keyOf(f) !== k);
  persist(next);
  return next;
}
