import { Icon } from "./Icon";

/** Uitleg van de score-opbouw; gedeeld door de lijst-header en de kaart-overlay. */
export function ScoreInfo({
  wantSun,
  wantDry,
  wantSnow,
}: {
  wantSun: boolean;
  wantDry: boolean;
  wantSnow: boolean;
}) {
  return (
    <div className="border-2 border-dashed border-outline-variant bg-surface-container-highest rounded-lg p-md space-y-sm animate-fade-in">
      <h4 className="font-headline-sm text-headline-sm uppercase text-primary flex items-center gap-2">
        <Icon name="calculate" /> Hoe de score werkt
      </h4>
      <p className="font-body-md text-sm text-on-surface-variant">
        Elke dag krijgt een cijfer van 0 tot 10. De eindscore is het{" "}
        <strong>gemiddelde over alle dagen</strong> van je reis — hoe meer goede
        dagen, hoe hoger (ook met een regendag ertussen).
      </p>
      <ul className="space-y-2 font-body-md text-sm">
        <li className="flex gap-2">
          <Icon name="water_drop" className="text-tertiary text-sm" />
          <span>
            <strong>Droog</strong> — neerslag en regenkans drukken de score.
            Weegt het zwaarst{wantDry ? " (en extra, want je koos “droog”)" : ""}.
          </span>
        </li>
        <li className="flex gap-2">
          <Icon name="thermostat" className="text-primary text-sm" />
          <span>
            <strong>Temperatuur</strong> — binnen jouw min–max band; te koud of
            te warm drukt de score. Weegt mee, maar net iets minder dan droogte.
          </span>
        </li>
        <li className="flex gap-2">
          <Icon name="sunny" className="text-secondary text-sm" filled />
          <span>
            <strong>Zon</strong> — minder bewolking = hoger
            {wantSun ? " (zwaarder, want je koos “zonnig”)" : ""}.
          </span>
        </li>
        {wantSnow && (
          <li className="flex gap-2">
            <Icon name="weather_snowy" className="text-tertiary text-sm" />
            <span>
              <strong>Sneeuw</strong> — sneeuwval en koude met neerslag scoren
              hoog (zwaarder, want je koos “sneeuw”).
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
