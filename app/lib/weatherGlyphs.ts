/**
 * Eigen, meerkleurige weer-glyphs (48×48). Elke glyph draagt zijn eigen kleuren
 * (amber zon, grijze wolk, blauwe druppel, ijsblauwe vlok, amber bliksem,
 * blauwgrijze maan), zodat de vorm én de kleur samen het weer tonen. De markup
 * is een string zodat zowel de React-`Icon` (via dangerouslySetInnerHTML) als de
 * Leaflet-kaart (raw HTML in een divIcon) exact dezelfde tekening gebruiken.
 */

type Glyph = { viewBox: string; body: string };

const SUN = "#e6a018";
const CLOUD = "#8b939b";
const FOG = "#9aa1a8";
const RAIN = "#5f8091";
const SNOW = "#84b3c9";
const BOLT = "#eaa61f";
const MOON = "#7e8ea3";
const HAIL = "#84b3c9";

const VB = "0 0 48 48";
const DROP_D = "M3 0 C3 0 6 4.5 6 7.5 A3 3 0 1 1 0 7.5 C0 4.5 3 0 3 0 Z";
const MOON_D = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";

const drop = (x: number, y: number, fill = RAIN, sc = 1) =>
  `<path transform="translate(${x},${y})${sc !== 1 ? ` scale(${sc})` : ""}" d="${DROP_D}" fill="${fill}"/>`;
const moon = (tx: number, ty: number, sc: number) =>
  `<path transform="translate(${tx},${ty}) scale(${sc})" d="${MOON_D}" fill="${MOON}"/>`;
const flake = (cx: number, cy: number, s: number, w = 1.8) => {
  const d = +(s * 0.71).toFixed(2);
  return (
    `<g stroke="${SNOW}" stroke-width="${w}" stroke-linecap="round">` +
    `<line x1="${cx}" y1="${cy - s}" x2="${cx}" y2="${cy + s}"/>` +
    `<line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}"/>` +
    `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}"/>` +
    `<line x1="${cx - d}" y1="${cy + d}" x2="${cx + d}" y2="${cy - d}"/></g>`
  );
};

/** Standaard regen-wolk (grijs), top ≈ 9, onderkant ≈ 31. */
const RAINCLOUD =
  `<g fill="${CLOUD}"><circle cx="17" cy="24" r="7.5"/><circle cx="32" cy="24" r="7.5"/>` +
  `<circle cx="24" cy="18" r="9"/><rect x="9" y="22" width="30" height="9.5" rx="4.75"/></g>`;
/** Wolk iets hoger (voor drie druppels/vlokken eronder). */
const RAINCLOUD_HI =
  `<g fill="${CLOUD}"><circle cx="17" cy="22" r="7.5"/><circle cx="32" cy="22" r="7.5"/>` +
  `<circle cx="24" cy="16" r="9"/><rect x="9" y="20" width="30" height="9.5" rx="4.75"/></g>`;
/** Kleine wolk vooraan (voor zon/maan + wolk). */
const SMALLCLOUD =
  `<g fill="${CLOUD}"><circle cx="22" cy="27" r="6.5"/><circle cx="35" cy="27" r="6.5"/>` +
  `<circle cx="28" cy="21" r="7.5"/><rect x="16" y="25" width="25" height="8" rx="4"/></g>`;

/**
 * Maan achter een wolk met een smalle transparante opening ertussen. Maan en
 * wolk hebben bijna dezelfde grijsblauwe tint, dus waar de wolk de maan overlapt
 * verdwijnt de rand. We maskeren daarom een iets vergrote wolk-silhouet (via een
 * zwarte rand-stroke) uit de maan weg; daar valt de achtergrond doorheen als een
 * dun gaatje. De echte wolk vult vervolgens de kern, zodat beide vormen los van
 * elkaar leesbaar blijven op elke ondergrond. `cloudShapes` zijn de kale vormen
 * (zonder fill-wrapper), zodat mask en wolk exact dezelfde silhouet delen.
 */
const moonBehindCloud = (id: string, moonStr: string, cloudShapes: string) =>
  `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">` +
  `<rect width="48" height="48" fill="white"/>` +
  `<g stroke="black" stroke-width="3.5" stroke-linejoin="round">${cloudShapes}</g>` +
  `</mask></defs>` +
  `<g mask="url(#${id})">${moonStr}</g>` +
  `<g fill="${CLOUD}">${cloudShapes}</g>`;

/** Kale wolk-vormen (zonder fill) voor de nacht-neerslag-iconen; net hoog genoeg
 *  dat er onder de wolk ruimte overblijft voor druppels, vlokken of bliksem. */
const NIGHT_CLOUD =
  `<circle cx="24" cy="28" r="6.5"/><circle cx="37" cy="28" r="6.5"/>` +
  `<circle cx="30" cy="22" r="7.5"/><rect x="18" y="26" width="25" height="8" rx="4"/>`;

/**
 * Compacte zon voor kaart-markers: een veel grotere gevulde schijf en kortere
 * stralen dan de gewone `sky_0` (die elders — legenda, detaillijsten — gebruikt
 * blijft). Op de kaart wordt de temperatuur over dit icoon heen gezet; met de
 * normale, kleine schijf en lange stralen viel dat cijfer niet meer af te lezen
 * tussen de stralen door. Deze variant geeft een groot solide amber vlak in het
 * midden, precies waar het getal komt.
 */
function compactSun(rDisc: number, rInner: number, rOuter: number): string {
  let rays = "";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    rays +=
      `<line x1="${(24 + rInner * ca).toFixed(2)}" y1="${(24 + rInner * sa).toFixed(2)}" ` +
      `x2="${(24 + rOuter * ca).toFixed(2)}" y2="${(24 + rOuter * sa).toFixed(2)}" ` +
      `stroke="${SUN}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return `<circle cx="24" cy="24" r="${rDisc}" fill="${SUN}"/>${rays}`;
}

export const WEATHER_GLYPHS: Record<string, Glyph> = {
  sky_0_map: { viewBox: VB, body: compactSun(14, 16, 20) },
  sky_0: {
    viewBox: VB,
    body:
      `<circle cx="24" cy="24" r="8.5" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">` +
      `<line x1="24" y1="4" x2="24" y2="10"/><line x1="24" y1="38" x2="24" y2="44"/>` +
      `<line x1="4" y1="24" x2="10" y2="24"/><line x1="38" y1="24" x2="44" y2="24"/>` +
      `<line x1="10" y1="10" x2="14.5" y2="14.5"/><line x1="33.5" y1="33.5" x2="38" y2="38"/>` +
      `<line x1="10" y1="38" x2="14.5" y2="33.5"/><line x1="33.5" y1="14.5" x2="38" y2="10"/></g>`,
  },
  sky_1: {
    viewBox: VB,
    body:
      `<circle cx="22" cy="20" r="8.5" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">` +
      `<line x1="22" y1="0" x2="22" y2="6"/><line x1="2" y1="20" x2="8" y2="20"/><line x1="40" y1="20" x2="45" y2="20"/>` +
      `<line x1="8" y1="6" x2="12.5" y2="10.5"/><line x1="31.5" y1="10.5" x2="36" y2="6"/></g>` +
      `<g fill="${CLOUD}"><circle cx="28" cy="34" r="6"/><circle cx="39" cy="34" r="6"/><circle cx="33" cy="29" r="7"/><rect x="23" y="32" width="21" height="7.5" rx="3.75"/></g>`,
  },
  sky_2: {
    viewBox: VB,
    body:
      `<circle cx="21" cy="19" r="8.5" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">` +
      `<line x1="21" y1="0" x2="21" y2="5"/><line x1="1" y1="19" x2="7" y2="19"/>` +
      `<line x1="7" y1="5" x2="11.5" y2="9.5"/><line x1="30.5" y1="9.5" x2="35" y2="5"/></g>` +
      `<g fill="${CLOUD}"><circle cx="20" cy="32" r="8"/><circle cx="35" cy="32" r="8"/><circle cx="27" cy="26" r="9.5"/><rect x="12" y="30" width="31" height="9.5" rx="4.75"/></g>`,
  },
  sky_3: {
    viewBox: VB,
    body:
      `<g fill="${CLOUD}"><circle cx="17" cy="28" r="8"/><circle cx="32" cy="28" r="8"/><circle cx="24" cy="21" r="9.5"/><rect x="9" y="26" width="30" height="10" rx="5"/></g>`,
  },
  foggy: {
    viewBox: VB,
    body:
      `<g fill="${FOG}"><circle cx="17" cy="25" r="8"/><circle cx="32" cy="25" r="8"/><circle cx="24" cy="18" r="9.5"/><rect x="9" y="23" width="30" height="10" rx="5"/></g>` +
      `<g fill="none" stroke="${FOG}" stroke-width="2.6" stroke-linecap="round">` +
      `<path d="M11 39 q3.25 -2.4 6.5 0 t6.5 0 t6.5 0 t6.5 0"/>` +
      `<path d="M15 45 q3 2.4 6 0 t6 0 t6 0"/></g>`,
  },
  drizzle: {
    viewBox: VB,
    body:
      RAINCLOUD +
      `<g fill="${RAIN}"><circle cx="15" cy="36" r="1.5"/><circle cx="21" cy="39" r="1.5"/><circle cx="27" cy="36" r="1.5"/><circle cx="33" cy="39" r="1.5"/><circle cx="18" cy="43" r="1.5"/><circle cx="30" cy="43" r="1.5"/><circle cx="24" cy="40" r="1.5"/></g>`,
  },
  rain_1: { viewBox: VB, body: RAINCLOUD + drop(21, 37) },
  rain_2: { viewBox: VB, body: RAINCLOUD + drop(15, 37) + drop(27, 37) },
  rain_3: {
    viewBox: VB,
    body: RAINCLOUD_HI + drop(11, 36) + drop(21, 36) + drop(31, 36),
  },
  showers: {
    viewBox: VB,
    body:
      `<circle cx="21" cy="19" r="8.5" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">` +
      `<line x1="21" y1="0" x2="21" y2="5"/><line x1="1" y1="19" x2="7" y2="19"/>` +
      `<line x1="7" y1="5" x2="11.5" y2="9.5"/><line x1="30.5" y1="9.5" x2="35" y2="5"/></g>` +
      `<g fill="${CLOUD}"><circle cx="20" cy="32" r="8"/><circle cx="35" cy="32" r="8"/><circle cx="27" cy="26" r="9.5"/><rect x="12" y="30" width="31" height="9.5" rx="4.75"/></g>` +
      drop(19, 40, RAIN, 0.75) +
      drop(31, 40, RAIN, 0.75),
  },
  sleet: {
    viewBox: VB,
    body:
      RAINCLOUD +
      drop(13, 35) +
      drop(29, 35) +
      `<circle cx="24" cy="41" r="2.4" fill="${HAIL}"/>`,
  },
  snow_1: { viewBox: VB, body: RAINCLOUD + flake(24, 41, 4) },
  snow_2: { viewBox: VB, body: RAINCLOUD + flake(18, 41, 4) + flake(30, 41, 4) },
  snow_3: {
    viewBox: VB,
    body:
      RAINCLOUD_HI +
      flake(14, 38, 3.5, 1.7) +
      flake(24, 42, 3.5, 1.7) +
      flake(34, 38, 3.5, 1.7),
  },
  snow_showers: {
    viewBox: VB,
    body:
      `<circle cx="21" cy="19" r="8.5" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">` +
      `<line x1="21" y1="0" x2="21" y2="5"/><line x1="1" y1="19" x2="7" y2="19"/>` +
      `<line x1="7" y1="5" x2="11.5" y2="9.5"/><line x1="30.5" y1="9.5" x2="35" y2="5"/></g>` +
      `<g fill="${CLOUD}"><circle cx="20" cy="32" r="8"/><circle cx="35" cy="32" r="8"/><circle cx="27" cy="26" r="9.5"/><rect x="12" y="30" width="31" height="9.5" rx="4.75"/></g>` +
      flake(22, 44, 2.6, 1.6) +
      flake(33, 44, 2.6, 1.6),
  },
  storm: {
    viewBox: VB,
    body:
      RAINCLOUD_HI +
      `<path d="M27 31 L18 43 L24.5 43 L22 48 L32 37 L26.5 37 Z" fill="${BOLT}"/>`,
  },
  storm_hail: {
    viewBox: VB,
    body:
      RAINCLOUD_HI +
      `<path d="M26.8 29.5 L18.4 41 L24.4 41 L22 46 L31.6 35 L26.2 35 Z" fill="${BOLT}"/>` +
      `<circle cx="15" cy="42" r="2.2" fill="${HAIL}"/><circle cx="35" cy="42" r="2.2" fill="${HAIL}"/>`,
  },
  sun_shower: {
    viewBox: VB,
    body:
      `<circle cx="15" cy="15" r="8" fill="${SUN}"/>` +
      `<g stroke="${SUN}" stroke-width="2.8" stroke-linecap="round"><line x1="15" y1="1" x2="15" y2="5.5"/><line x1="1" y1="15" x2="5.5" y2="15"/><line x1="29" y1="15" x2="33.5" y2="15"/><line x1="5.5" y1="5.5" x2="8.6" y2="8.6"/><line x1="24.5" y1="5.5" x2="21.4" y2="8.6"/></g>` +
      `<g fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M6 49 A21 21 0 0 1 48 49" stroke="#d9553a"/><path d="M9 49 A18 18 0 0 1 45 49" stroke="#e79a2a"/><path d="M12 49 A15 15 0 0 1 42 49" stroke="#f0c33a"/><path d="M15 49 A12 12 0 0 1 39 49" stroke="#5f9e4a"/><path d="M18 49 A9 9 0 0 1 36 49" stroke="#4f86a8"/></g>` +
      drop(17, 20, "#4f86a8") +
      drop(27, 22, "#4f86a8"),
  },
  moon: { viewBox: VB, body: moon(1, 1, 1.9) },
  moon_partly: {
    viewBox: VB,
    body: moonBehindCloud(
      "nGapP",
      moon(-2, -2, 1.7),
      `<circle cx="28" cy="34" r="6"/><circle cx="39" cy="34" r="6"/><circle cx="33" cy="29" r="7"/><rect x="23" y="32" width="21" height="7.5" rx="3.75"/>`,
    ),
  },
  moon_cloud: {
    viewBox: VB,
    body: moonBehindCloud(
      "nGapC",
      moon(-2, -3, 1.9),
      `<circle cx="25" cy="34" r="7"/><circle cx="38" cy="34" r="7"/><circle cx="31" cy="29" r="8"/><rect x="18" y="32" width="25" height="8.5" rx="4.25"/>`,
    ),
  },
  moon_rain: {
    viewBox: VB,
    body:
      moonBehindCloud("nGapRain", moon(-5, -3, 1.7), NIGHT_CLOUD) +
      drop(22, 36) +
      drop(32, 36),
  },
  moon_storm: {
    viewBox: VB,
    body:
      moonBehindCloud("nGapStorm", moon(-5, -3, 1.7), NIGHT_CLOUD) +
      `<path d="M28 33 L21 43 L26 43 L24 47 L32 38 L27.5 38 Z" fill="${BOLT}"/>`,
  },
  moon_snow: {
    viewBox: VB,
    body:
      moonBehindCloud("nGapSnow", moon(-5, -3, 1.7), NIGHT_CLOUD) +
      flake(23, 40, 3, 1.7) +
      flake(33, 40, 3, 1.7),
  },
};

/**
 * Bouwt een volledige <svg>-string voor een eigen weer-glyph (voor Leaflet).
 * Geeft null voor namen zonder eigen glyph. De `color` wordt genegeerd door de
 * meerkleurige glyphs, maar blijft in de signatuur voor bestaande aanroepen.
 */
export function weatherGlyphSvg(
  name: string,
  sizePx: number,
  _color: string,
): string | null {
  const g = WEATHER_GLYPHS[name];
  if (!g) return null;
  return (
    `<svg viewBox="${g.viewBox}" width="${sizePx}" height="${sizePx}" ` +
    `fill="none">${g.body}</svg>`
  );
}
