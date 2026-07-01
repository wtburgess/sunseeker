"use client";

import { useState } from "react";
import { Icon } from "./Icon";

type Props = {
  /** Huidige tekst in het invulveld (bestuurd door de pagina). */
  value: string;
  /** Wijziging van de invulveld-tekst. */
  onChange: (v: string) => void;
  /** Leest de locatie van pc/smartphone in. */
  onLocate: () => void;
  /** True zolang de toestellocatie wordt opgehaald. */
  locating: boolean;
  /** Zoekt een getypte plaatsnaam op (async). */
  onSubmitPlace: (query: string) => Promise<void>;
  /** Optionele melding (bv. geen locatie / niet gevonden). */
  notice: string | null;
};

/** Balk boven de kaart: [locatie inlezen] [invulveld plaats] [Enter]. */
export function LocationBar({
  value,
  onChange,
  onLocate,
  locating,
  onSubmitPlace,
  notice,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function submit() {
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      await onSubmitPlace(q);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-outline-variant bg-surface/95 backdrop-blur-sm px-3 py-2">
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

        {/* Midden: invulveld voor een plaats */}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Zoek een plaats…"
          type="text"
          enterKeyHint="search"
          className="flex-grow min-w-0 h-11 px-3 rounded-lg bg-surface-container-high border border-outline-variant font-body-md text-body-md placeholder:text-outline/50 focus:outline-none focus:border-primary"
        />

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
