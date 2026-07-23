import {
  conditionFromCurrent,
  conditionFromDay,
  type CurrentWeather,
  type DailyDetail,
} from "./weather";

/** Weerpraatje: vlotte tekst over vandaag, deze week en de wind. */
export type WeatherStory = { today: string; week: string; wind: string };

const weekdayLong = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "long" });

/** Weekdag met hoofdletter, voor aan het begin van een zin. */
const weekdayCap = (iso: string) => {
  const d = weekdayLong(iso);
  return d.charAt(0).toUpperCase() + d.slice(1);
};

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

/** Windrichting (graden, waar de wind vándaan komt) → "uit het zuidwesten". */
function windDirPhrase(deg: number): string {
  const dirs = [
    "uit het noorden",
    "uit het noordoosten",
    "uit het oosten",
    "uit het zuidoosten",
    "uit het zuiden",
    "uit het zuidwesten",
    "uit het westen",
    "uit het noordwesten",
  ];
  return dirs[Math.round(deg / 45) % 8];
}

/** Beaufort → losse omschrijving. */
function beaufortDesc(bft: number): string {
  if (bft <= 0) return "een vrijwel windstille lucht";
  if (bft === 1) return "amper een zuchtje wind";
  if (bft <= 3) return "een zwak windje";
  if (bft === 4) return "een matige wind";
  if (bft === 5) return "een vrij stevige wind";
  if (bft === 6) return "een stevige wind";
  if (bft === 7) return "een harde wind";
  if (bft === 8) return "een stormachtige wind";
  return "storm";
}

/** Stukje over vandaag: nu-weer + verwachte max/min, zon en neerslag. */
function todayStory(
  place: string,
  current: CurrentWeather | null,
  today: DailyDetail,
): string {
  const parts: string[] = [];

  if (current) {
    const nu = conditionFromCurrent(current).label.toLowerCase();
    parts.push(`In ${place} is het nu ${Math.round(current.temp)}° en ${nu}.`);
  }

  const cond = conditionFromDay(today).label.toLowerCase();
  const ochtend =
    today.tMax - today.tMin >= 4 ? ` (vanochtend nog rond ${today.tMin}°)` : "";
  parts.push(
    `Vandaag loopt het op tot zo'n ${today.tMax}°${ochtend}, ${cond}, met ${sunText(today.sunHours)}.`,
  );

  if (isSnowCode(today.code)) {
    parts.push("Er kan sneeuw vallen, dus kleed je warm aan!");
  } else if (today.precip >= 1) {
    const kans =
      today.precipProb >= 30
        ? ` (regenkans ${Math.round(today.precipProb)}%)`
        : "";
    const mm = today.precip.toLocaleString("nl-BE", { maximumFractionDigits: 1 });
    parts.push(`Reken op ${mm} mm regen${kans} — hou een paraplu bij de hand.`);
  } else if (today.precipProb >= 40) {
    parts.push(`Er hangt een buitje in de lucht (${Math.round(today.precipProb)}% kans).`);
  } else {
    parts.push("Het blijft grotendeels droog.");
  }

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

  parts.push(
    lo === hi
      ? `Deze week blijft de maximumtemperatuur rond ${hi}°.`
      : `Deze week schommelt de maximumtemperatuur tussen ${lo}° en ${hi}°.`,
  );

  if (sunnyDays > 0 && wetDays > 0) {
    parts.push(
      `Er zitten ${plural(sunnyDays, "mooie zonnige dag", "mooie zonnige dagen")} tussen en ${plural(wetDays, "dag met regen", "dagen met regen")}.`,
    );
  } else if (sunnyDays > 0) {
    parts.push(
      `Het wordt een fijne week: ${plural(sunnyDays, "overwegend zonnige dag", "overwegend zonnige dagen")} en amper regen.`,
    );
  } else if (wetDays > 0) {
    parts.push(
      `Het wordt vooral grijs, met ${plural(wetDays, "natte dag", "natte dagen")}.`,
    );
  } else {
    parts.push("Het blijft wat wisselvallig, zonder echte uitschieters.");
  }

  const best = [...week].sort(
    (a, b) => b.sunFraction - a.sunFraction || a.precip - b.precip,
  )[0];
  if (best && best.sunFraction >= 0.5) {
    parts.push(
      `Zin in een uitstap? ${weekdayCap(best.date)} lijkt de mooiste dag: ${best.tMax}° en ${sunText(best.sunHours)}.`,
    );
  }

  const half = Math.floor(week.length / 2);
  const avg = (arr: DailyDetail[]) =>
    arr.reduce((a, d) => a + d.tMax, 0) / arr.length;
  const diff = avg(week.slice(week.length - half)) - avg(week.slice(0, half));
  if (diff >= 3) parts.push("Naar het weekend toe wordt het warmer.");
  else if (diff <= -3) parts.push("Het koelt in de loop van de week wat af.");
  else parts.push("Verder blijft de temperatuur vrij stabiel.");

  if (snowDays > 0)
    parts.push(`Op ${plural(snowDays, "dag", "dagen")} kan er sneeuw vallen.`);
  if (stormDays > 0)
    parts.push(`En hou rekening met onweer op ${plural(stormDays, "dag", "dagen")}.`);

  return parts.join(" ");
}

/** Stukje over de wind: vandaag (kracht + richting) en de winderigste dag. */
function windStory(days: DailyDetail[]): string {
  const today = days[0];
  const parts: string[] = [
    `Vandaag waait er ${beaufortDesc(today.windBft)} ${windDirPhrase(today.windDir)} (${today.windBft} Bft).`,
  ];

  const week = days.slice(0, 7);
  const windiest = [...week].sort((a, b) => b.windBft - a.windBft)[0];
  if (
    windiest &&
    windiest.date !== today.date &&
    windiest.windBft >= today.windBft + 2 &&
    windiest.windBft >= 5
  ) {
    parts.push(
      `Het waait deze week het hardst op ${weekdayLong(windiest.date)} (${windiest.windBft} Bft).`,
    );
  } else if (week.every((d) => d.windBft <= 3)) {
    parts.push("De rest van de week blijft het lekker rustig.");
  }

  return parts.join(" ");
}

/** Bouwt het volledige weerpraatje voor één plaats. */
export function buildWeatherStory(
  place: string,
  current: CurrentWeather | null,
  days: DailyDetail[],
): WeatherStory {
  if (days.length === 0) return { today: "", week: "", wind: "" };
  return {
    today: todayStory(place, current, days[0]),
    week: weekStory(days),
    wind: windStory(days),
  };
}
