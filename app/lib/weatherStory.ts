import {
  conditionFromCurrent,
  conditionFromDay,
  type CurrentWeather,
  type DailyDetail,
} from "./weather";

/** Weerpraatje: een vlotte tekst over vandaag en over de rest van de week. */
export type WeatherStory = { today: string; week: string };

const weekdayLong = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "long" });

/** "1 dag" / "3 dagen" enz. */
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Zonuren afgerond, met "uur"/"uren". */
const sunText = (h: number) => {
  const u = Math.round(h);
  return `${u} ${u === 1 ? "zonuur" : "zonuren"}`;
};

const isSnowCode = (c: number) =>
  (c >= 71 && c <= 77) || c === 85 || c === 86;
const isStormCode = (c: number) => c >= 95;

/** Stukje over vandaag: nu-weer + verwachte max/min, zon, neerslag en wind. */
function todayStory(
  place: string,
  current: CurrentWeather | null,
  today: DailyDetail,
): string {
  const parts: string[] = [];

  if (current) {
    const nu = conditionFromCurrent(current).label.toLowerCase();
    parts.push(
      `In ${place} is het nu ${Math.round(current.temp)}° en ${nu}.`,
    );
  }

  // Verwachte dag: max (en min als die duidelijk lager ligt) + zon.
  const cond = conditionFromDay(today).label.toLowerCase();
  let dag = `Vandaag wordt het maximaal ${today.tMax}°`;
  if (today.tMax - today.tMin >= 4) dag += ` (vanochtend rond ${today.tMin}°)`;
  dag += `, ${cond}, met ${sunText(today.sunHours)}.`;
  parts.push(dag);

  // Neerslag.
  if (isSnowCode(today.code)) {
    parts.push("Er kan sneeuw vallen — trek je warme kleren aan.");
  } else if (today.precip >= 1) {
    const kans =
      today.precipProb >= 30 ? ` (regenkans ${Math.round(today.precipProb)}%)` : "";
    parts.push(
      `Reken op ${today.precip.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} mm neerslag${kans}.`,
    );
  } else if (today.precipProb >= 40) {
    parts.push(`Er is kans op een bui (${Math.round(today.precipProb)}%).`);
  } else {
    parts.push("Het blijft grotendeels droog.");
  }

  // Wind (alleen vermelden als het noemenswaardig is).
  if (today.windBft >= 6) parts.push(`Het waait stevig (${today.windBft} Bft).`);
  else if (today.windBft >= 4) parts.push(`Er staat een matige wind (${today.windBft} Bft).`);

  return parts.join(" ");
}

/** Stukje over de rest van de week: bandbreedte, zon/regen, mooiste dag, trend. */
function weekStory(days: DailyDetail[]): string {
  const week = days.slice(0, 7);
  if (week.length <= 1) return "";

  const tMaxes = week.map((d) => d.tMax);
  const lo = Math.min(...tMaxes);
  const hi = Math.max(...tMaxes);

  const sunnyDays = week.filter((d) => d.sunFraction >= 0.6).length;
  const wetDays = week.filter((d) => d.precip >= 1).length;
  const snowDays = week.filter((d) => isSnowCode(d.code)).length;
  const stormDays = week.filter((d) => isStormCode(d.code)).length;

  const parts: string[] = [];

  // Temperatuurband.
  parts.push(
    lo === hi
      ? `Deze week blijft de maximumtemperatuur rond ${hi}°.`
      : `Deze week ligt de maximumtemperatuur tussen ${lo}° en ${hi}°.`,
  );

  // Zon vs. regen.
  if (sunnyDays > 0 && wetDays > 0) {
    parts.push(
      `Er zitten ${plural(sunnyDays, "overwegend zonnige dag", "overwegend zonnige dagen")} tussen, en ${plural(wetDays, "dag met regen", "dagen met regen")}.`,
    );
  } else if (sunnyDays > 0) {
    parts.push(
      `Het wordt een mooie week met ${plural(sunnyDays, "overwegend zonnige dag", "overwegend zonnige dagen")} en weinig regen.`,
    );
  } else if (wetDays > 0) {
    parts.push(
      `Het wordt overwegend grijs, met ${plural(wetDays, "dag met regen", "dagen met regen")}.`,
    );
  } else {
    parts.push("Het weer blijft wisselvallig, zonder uitgesproken zon of regen.");
  }

  // Mooiste dag: veel zon en droog.
  const best = [...week].sort(
    (a, b) => b.sunFraction - a.sunFraction || a.precip - b.precip,
  )[0];
  if (best && best.sunFraction >= 0.5) {
    parts.push(
      `De mooiste dag lijkt ${weekdayLong(best.date)}: ${best.tMax}° en ${sunText(best.sunHours)}.`,
    );
  }

  // Trend: eerste helft vs. tweede helft van de week.
  const half = Math.floor(week.length / 2);
  const avg = (arr: DailyDetail[]) =>
    arr.reduce((a, d) => a + d.tMax, 0) / arr.length;
  const diff = avg(week.slice(week.length - half)) - avg(week.slice(0, half));
  if (diff >= 3) parts.push("Naar het weekend toe wordt het warmer.");
  else if (diff <= -3) parts.push("Het koelt in de loop van de week af.");
  else parts.push("De temperatuur blijft vrij stabiel.");

  // Bijzonderheden.
  if (snowDays > 0)
    parts.push(`Op ${plural(snowDays, "dag", "dagen")} kan er sneeuw vallen.`);
  if (stormDays > 0)
    parts.push(`Houd ook rekening met onweer op ${plural(stormDays, "dag", "dagen")}.`);

  return parts.join(" ");
}

/** Bouwt het volledige weerpraatje voor één plaats. */
export function buildWeatherStory(
  place: string,
  current: CurrentWeather | null,
  days: DailyDetail[],
): WeatherStory {
  if (days.length === 0) return { today: "", week: "" };
  return {
    today: todayStory(place, current, days[0]),
    week: weekStory(days),
  };
}
