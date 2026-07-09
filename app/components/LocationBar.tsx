"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { geocodeSuggest, type GeocodeResult } from "../lib/geo";

type Props = {
  /** Huidige tekst in het invulveld (bestuurd door de pagina). */
  value: string;
  /** Wijziging van de invulveld-tekst. */
  onChange: (v: string) => void;
  /** Leest de locatie van pc/smartphone in. */
  onLocate: () => void;
  /** True zolang de toestellocatie wordt opgehaald. */
  locating: boolean;
  /** Zoekt een vrij getypte plaatsnaam op (async) — fallback zonder voorstel. */
  onSubmitPlace: (query: string) => Promise<void>;
  /** Kiest een concreet voorstel uit de shortlist (coördinaten al bekend). */
  onSelectPlace: (place: GeocodeResult) => void;
  /** Optionele melding (bv. geen locatie / niet gevonden). */
  notice: string | null;
};

/** Ondertitel bij een voorstel: regio + land, voor het onderscheiden van
 *  gelijknamige plaatsen. */
function subtitle(p: GeocodeResult): string {
  return [p.admin1, p.country].filter(Boolean).join(", ");
}

/** Balk boven de kaart: [locatie inlezen] [invulveld plaats + type-ahead] [Enter]. */
export function LocationBar({
  value,
  onChange,
  onLocate,
  locating,
  onSubmitPlace,
  onSelectPlace,
  notice,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // True zolang het veld focus heeft: alleen dán tonen we voorstellen. Zo opent
  // de lijst niet vanzelf als de plaatsnaam programmatisch wordt ingevuld
  // (bv. de toestellocatie bij het opstarten).
  const [focused, setFocused] = useState(false);
  // Onderdrukt één zoekronde direct na een keuze (anders opent de lijst meteen
  // opnieuw doordat het invulveld op de gekozen naam wordt gezet).
  const suppress = useRef(false);

  // Terwijl je typt: (ontdubbeld) voorstellen ophalen — enkel bij focus.
  useEffect(() => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (!focused) return;
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActive(-1);
      return;
    }
    const t = setTimeout(async () => {
      const list = await geocodeSuggest(q, 6).catch(() => []);
      setSuggestions(list);
      setActive(-1);
      if (list.length) setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [value, focused]);

  const showList = open && suggestions.length > 0;

  function pick(i: number) {
    const place = suggestions[i];
    if (!place) return;
    suppress.current = true;
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
    onSelectPlace(place);
  }

  async function submit() {
    // Staat er een lijst open, dan is het bovenste (of gemarkeerde) voorstel de
    // bedoeling; anders vrij opzoeken op de getypte tekst.
    if (showList) {
      pick(active >= 0 ? active : 0);
      return;
    }
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      await onSubmitPlace(q);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && showList) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative z-[1200] border-b border-outline-variant bg-surface/95 backdrop-blur-sm px-3 py-2">
      <div className="flex items-center gap-2 max-w-2xl mx-auto">
        {/* Links: locatie van pc/smartphone inlezen */}
        <button
          onClick={onLocate}
          disabled={locating}
          aria-label="Mijn locatie gebruiken"
          className="flex-shrink-0 w-11 h-11 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary active-press disabled:opacity-60"
        >
          <Icon
            name={locating ? "progress_activity" : "my_location"}
            className={locating ? "animate-spin" : ""}
          />
        </button>

        {/* Midden: invulveld met type-ahead-voorstellen eronder */}
        <div className="relative flex-grow min-w-0">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              if (suggestions.length) setOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Zoek een plaats…"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-autocomplete="list"
            className="w-full h-11 px-3 rounded-lg bg-surface-container-high border border-outline-variant font-body-md text-body-md placeholder:text-outline/50 focus:outline-none focus:border-primary"
          />

          {showList && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-[1300] max-h-72 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-high shadow-xl overscroll-contain"
            >
              {suggestions.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === active}>
                  {/* onMouseDown i.p.v. onClick: vuurt vóór de input-blur, zodat
                      de keuze niet verloren gaat. */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(i);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left border-b border-outline-variant last:border-b-0 ${
                      i === active ? "bg-surface-container-highest" : ""
                    }`}
                  >
                    <Icon
                      name="location_on"
                      className="text-[20px] text-primary shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-body-md text-body-md">
                        {p.name}
                      </span>
                      {subtitle(p) && (
                        <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">
                          {subtitle(p)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rechts: Enter */}
        <button
          onClick={submit}
          disabled={busy || !value.trim()}
          className="flex-shrink-0 h-11 px-4 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg uppercase tracking-widest active-press disabled:opacity-50"
        >
          {busy ? (
            <Icon name="progress_activity" className="animate-spin" />
          ) : (
            "Enter"
          )}
        </button>
      </div>

      {notice && (
        <p className="max-w-2xl mx-auto mt-1.5 font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
          <Icon name="info" className="text-[16px] text-primary" />
          {notice}
        </p>
      )}
    </div>
  );
}
