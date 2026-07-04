"use client";

import { Icon } from "./Icon";

type Row = { icon: string; name: string; rule: string; color: string };

/** Alle weericonen met de regel wanneer ze verschijnen. */
const ROWS: Row[] = [
  { icon: "sky_0", name: "Zon", rule: "Veel zon", color: "text-[#e0962b]" },
  { icon: "sky_1", name: "Overwegend zonnig", rule: "60–85% zon overdag", color: "text-[#e0962b]" },
  { icon: "sky_2", name: "Half bewolkt", rule: "35–60% zon overdag", color: "text-[#e0962b]" },
  { icon: "sky_3", name: "Bewolkt", rule: "Weinig zon", color: "text-[#9aa6ac]" },
  { icon: "foggy", name: "Mist", rule: "Mistcode, droge dag", color: "text-[#9aa6ac]" },
  { icon: "rain_1", name: "Lichte regen", rule: "1–2 mm per dag", color: "text-[#7f97a8]" },
  { icon: "rain_2", name: "Matige regen", rule: "2–10 mm per dag", color: "text-[#7f97a8]" },
  { icon: "rain_3", name: "Veel regen", rule: "Meer dan 10 mm per dag", color: "text-[#7f97a8]" },
  { icon: "storm", name: "Onweer", rule: "Onweerscode", color: "text-error" },
  { icon: "weather_snowy", name: "Sneeuw", rule: "Sneeuwcode", color: "text-[#93b4c6]" },
  { icon: "moon", name: "Heldere nacht", rule: "'s Nachts, weinig bewolking", color: "text-[#8a97a8]" },
  { icon: "moon_cloud", name: "Bewolkte nacht", rule: "'s Nachts, meer bewolking", color: "text-[#8a97a8]" },
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
        <ul>
          {ROWS.map((r) => (
            <li
              key={r.name}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-outline-variant"
            >
              <Icon
                name={r.icon}
                filled
                className={`text-[40px] shrink-0 ${r.color}`}
              />
              <div className="min-w-0">
                <div className="font-headline-sm text-[19px] uppercase leading-tight">
                  {r.name}
                </div>
                <div className="text-[14px] text-on-surface-variant leading-tight">
                  {r.rule}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <p className="px-4 py-3 text-[13px] leading-snug text-on-surface-variant border-t border-outline-variant">
          Op de kaart geeft de kleur van het icoon het weer aan (goud = zon,
          grijs = bewolkt, blauw = regen). Een lichtgrijs, doorgestreept icoon
          valt buiten je filter.
        </p>
      </div>
    </div>
  );
}
