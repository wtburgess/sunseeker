/**
 * Eigen weer-SVG's voor de regen-intensiteit (1/2/3 streepjes) en onweer.
 * Material Symbols biedt geen nette opbouw van 1 → 2 → 3 regenstreepjes, dus
 * tekenen we die zelf. De markup is opzettelijk een string: zo kan zowel de
 * React-`Icon` (via dangerouslySetInnerHTML) als de Leaflet-kaart (raw HTML in
 * een divIcon) exact dezelfde tekening gebruiken. Alles gebruikt currentColor,
 * zodat de bestaande tekstkleur-klassen de kleur blijven bepalen.
 *
 * Per glyph hoort een strakke viewBox: de tekening vult dan even veel van het
 * icoon-vlak (~82%) als de Material Symbols-iconen ernaast, zodat de regen-
 * iconen in de lijst even groot ogen als de rest.
 */

type Glyph = { viewBox: string; body: string };

const CLOUD =
  '<g fill="currentColor">' +
  '<ellipse cx="9" cy="11" rx="4.2" ry="3.6"/>' +
  '<ellipse cx="15" cy="11" rx="4.5" ry="4"/>' +
  '<circle cx="12" cy="8.5" r="3.6"/>' +
  '<rect x="6" y="10.4" width="12" height="3.3" rx="1.6"/>' +
  "</g>";

/** Eén licht schuin regenstreepje, gecentreerd op x. */
const streak = (x: number) =>
  `<line x1="${x + 0.9}" y1="15.5" x2="${x - 0.9}" y2="20.5" ` +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

/** Bliksemflits onder de wolk (onweer). */
const BOLT =
  '<polygon points="12.6,13.8 9.2,18.8 11.8,18.8 10.6,21 15,16.4 12,16.4" ' +
  'fill="currentColor"/>';

/** Zon: schijf met 8 stralen, gecentreerd op (cx, cy). */
function sun(cx: number, cy: number, r: number): string {
  let rays = "";
  const inner = r + 1.5;
  const outer = r + 3.5;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    rays +=
      `<line x1="${(cx + inner * ca).toFixed(2)}" y1="${(cy + inner * sa).toFixed(2)}"` +
      ` x2="${(cx + outer * ca).toFixed(2)}" y2="${(cy + outer * sa).toFixed(2)}"` +
      ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>${rays}`;
}

/** Dezelfde wolk als CLOUD, verschaald en verplaatst (center ≈ 12, 10.5). */
const cloudAt = (cx: number, cy: number, s: number) =>
  `<g transform="translate(${(cx - s * 12).toFixed(2)},${(cy - s * 10.5).toFixed(2)}) scale(${s})">${CLOUD}</g>`;

/** Wassende maan (crescent), getekend in een 24-box, geschaald en geplaatst. */
const MOON_PATH = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";
const moonAt = (cx: number, cy: number, s: number) =>
  `<g transform="translate(${(cx - s * 12).toFixed(2)},${(cy - s * 12).toFixed(2)}) scale(${s})">` +
  `<path d="${MOON_PATH}" fill="currentColor"/></g>`;

// Strakke kadering rond wolk + streepjes/bliksem.
const RAIN_VB = "3 3.5 18 18";
// Kadering voor de zon→bewolkt-trap.
const SKY_VB = "1.5 1.5 19 19";

export const WEATHER_GLYPHS: Record<string, Glyph> = {
  rain_1: { viewBox: RAIN_VB, body: CLOUD + streak(12) },
  rain_2: { viewBox: RAIN_VB, body: CLOUD + streak(9.5) + streak(14.5) },
  rain_3: { viewBox: RAIN_VB, body: CLOUD + streak(8) + streak(12) + streak(16) },
  storm: { viewBox: RAIN_VB, body: CLOUD + BOLT },
  // Losse bliksemflits (bliksem), beeldvullend.
  lightning: {
    viewBox: "0 0 24 24",
    body: '<polygon points="13,2 5,13.5 11,13.5 9,22 19,9.5 12,9.5" fill="currentColor"/>',
  },
  // Trap van zon → bewolkt (wolk wordt steeds groter; cloud vóór de zon).
  sky_0: { viewBox: SKY_VB, body: sun(12, 12, 4.2) },
  sky_1: { viewBox: SKY_VB, body: sun(8.6, 9, 3.1) + cloudAt(14.6, 15.4, 0.62) },
  sky_2: { viewBox: SKY_VB, body: sun(8, 8, 2.6) + cloudAt(13, 14.8, 0.85) },
  sky_3: { viewBox: SKY_VB, body: cloudAt(11, 11, 1.15) },
  // Nacht: heldere maan en maan-met-wolk (zelfde formaat als de zon-trap).
  moon: { viewBox: SKY_VB, body: moonAt(12, 12, 0.82) },
  moon_cloud: {
    viewBox: SKY_VB,
    body: moonAt(8.4, 8, 0.5) + cloudAt(13, 14.8, 0.85),
  },
};

/**
 * Bouwt een volledige <svg>-string voor een eigen weer-glyph, voor gebruik in
 * raw HTML (Leaflet-markers). Geeft null voor namen zonder eigen glyph.
 */
export function weatherGlyphSvg(
  name: string,
  sizePx: number,
  color: string,
): string | null {
  const g = WEATHER_GLYPHS[name];
  if (!g) return null;
  return (
    `<svg viewBox="${g.viewBox}" width="${sizePx}" height="${sizePx}" ` +
    `fill="none" style="color:${color}">${g.body}</svg>`
  );
}
