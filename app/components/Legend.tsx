"use client";

import { Icon } from "./Icon";

type Row = { icon: string; name: string; rule: string };
type Group = { title: string; rows: Row[] };

/** Alle weericonen met de regel wanneer ze verschijnen, gegroepeerd. */
const GROUPS: Group[] = [
  {
    title: "Overdag",
    rows: [
      { icon: "sky_0", name: "Zon", rule: "≥85% zon · ±7u (winter), ±14u (zomer)" },
      { icon: "sky_1", name: "Overwegend zonnig", rule: "60–85% zon · 5–7u (winter), 10–14u (zomer)" },
      { icon: "sky_2", name: "Half bewolkt", rule: "35–60% zon · 3–5u (winter), 6–10u (zomer)" },
      { icon: "sky_3", name: "Bewolkt", rule: "Weinig zon" },
      { icon: "foggy", name: "Mist", rule: "Mistcode, droge lucht" },
    ],
  },
  {
    title: "Regen",
    rows: [
      { icon: "drizzle", name: "Motregen", rule: "Fijne regen (51–57)" },
      { icon: "rain_1", name: "Lichte regen", rule: "1–2 mm per dag" },
      { icon: "rain_2", name: "Matige regen", rule: "2–10 mm per dag" },
      { icon: "rain_3", name: "Veel regen", rule: "Meer dan 10 mm per dag" },
      { icon: "showers", name: "Buien", rule: "Korte bui overdag (80–82)" },
      { icon: "sleet", name: "IJzel", rule: "Aanvriezende (mot)regen" },
      { icon: "sun_shower", name: "Zonnige bui", rule: "Zon + regen tegelijk" },
    ],
  },
  {
    title: "Sneeuw",
    rows: [
      { icon: "snow_1", name: "Lichte sneeuw", rule: "WMO 71" },
      { icon: "snow_2", name: "Matige sneeuw", rule: "WMO 73" },
      { icon: "snow_3", name: "Zware sneeuw", rule: "WMO 75" },
      { icon: "snow_showers", name: "Sneeuwbuien", rule: "Overdag (85–86)" },
    ],
  },
  {
    title: "Onweer",
    rows: [
      { icon: "storm", name: "Onweer", rule: "WMO 95" },
      { icon: "storm_hail", name: "Onweer met hagel", rule: "WMO 96/99" },
    ],
  },
  {
    title: "'s Nachts",
    rows: [
      { icon: "moon", name: "Heldere nacht", rule: "Weinig bewolking" },
      { icon: "moon_partly", name: "Half bewolkte nacht", rule: "Wat bewolking" },
      { icon: "moon_cloud", name: "Bewolkte nacht", rule: "Veel bewolking" },
      { icon: "moon_rain", name: "Regen 's nachts", rule: "Neerslag in het donker" },
      { icon: "moon_storm", name: "Onweer 's nachts", rule: "Onweer in het donker" },
      { icon: "moon_snow", name: "Sneeuw 's nachts", rule: "Sneeuw in het donker" },
    ],
  },
];

/** Legenda-scherm: alle weericonen + de regel wanneer elk verschijnt. */
export function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[1300] bg-surface flex flex-col animate-fade-in">
      <div className="flex items-center gap-1 px-3 h-14 shrink-0 border-b-2 border-outline-variant">
        <button
          onClick={onClose}
          aria-label="Terug"
          className="w-10 h-10 -ml-2 shrink-0 rounded-full flex items-center justify-center hover:bg-surface-container-high active-press"
        >
          <Icon name="arrow_back" className="text-[24px]" />
        </button>
        <h2 className="flex-grow font-headline-md text-headline-md uppercase tracking-wide">
          Weericonen
        </h2>
      </div>

      <div className="flex-grow overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-4 pt-3 pb-1 font-headline-sm text-[14px] uppercase tracking-widest text-outline bg-surface-container-low">
              {g.title}
            </div>
            <ul>
              {g.rows.map((r) => (
                <li
                  key={r.icon}
                  className="flex items-center gap-3 px-4 py-2 border-b border-outline-variant"
                >
                  <Icon name={r.icon} className="text-[40px] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-headline-sm text-[18px] uppercase leading-tight">
                      {r.name}
                    </div>
                    <div className="text-[13px] text-on-surface-variant leading-tight">
                      {r.rule}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="px-4 py-3 text-[13px] leading-snug text-on-surface-variant">
          Op de kaart: een vervaagd, doorgestreept icoon valt buiten je filter.
        </p>
      </div>
    </div>
  );
}
