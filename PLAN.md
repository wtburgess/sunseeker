# Plan — Weekplanner & Vergelijk-modus voor Sunseeker

Uitbreiding van de kaart-viewer zodat hij twee reisvragen beantwoordt die hij nu
niet (goed) aankan:

1. **Korte trip** — *"Waar is het volgende week een aantal dagen voldoende goed
   weer, binnen X km?"* → een **rangschikking van bestemmingen** (laag 1–3).
2. **Verre campertoer** — *"Zweden of Polen?"* → een **samenvatting per
   land/regio** (laag 4).

Geen code in dit document; dit is het uitvoeringsplan.

---

## Uitgangspunt: wat er al is

| Deel van de vraag | Status vandaag |
|---|---|
| binnen X km | ✅ afstand-slider + cirkel op de kaart |
| een periode kiezen | ⚠️ enkel dag-per-dag scrubben, geen bereik |
| meerdaags oordeel | ❌ filter beoordeelt één dag tegelijk |
| "voldoende goed weer" over de dagen samen | ❌ niet in de kaart-UI |
| één bestemming kiezen | ❌ geen rangschikking, zelf speuren |

**Belangrijk:** de meerdaagse scoremotor bestáát al in
[`weather.ts`](app/lib/weather.ts) (`scoreTrip`, `planTrip`, `goodDays`,
"beste aaneengesloten dagen"), maar werd bij de map-first herbouw losgekoppeld en
draait niet meer in de UI. Veel van dit plan is die logica **weer aansluiten**,
niet nieuw bouwen.

## Kernprincipe (één bron van waarheid)

Eén definitie drijft alles aan: een dag is **"goed"** als hij aan de bestaande
weer-sliders voldoet (`passesWeather` in
[`LiveMap.tsx:626`](app/components/LiveMap.tsx:626)). Alle nieuwe logica telt
enkel hoeveel goede dagen er in de gekozen **periode** vallen. Zo is er geen
tweede, concurrerend scoresysteem.

---

## Laag 0 — Voorbereiding (data & horizon)

1. **Forecast-venster verlengen.** `TIMELINE_DAYS = 10`
   ([`LiveMap.tsx:78`](app/components/LiveMap.tsx:78)) dekt vandaag t/m +9.
   "Volgende week" (ma–zo) kan tot 13 dagen vooruit reiken. → Zet naar **14**.
   Open-Meteo levert gratis tot 16 daily-dagen; enkel iets meer data per plaats.
2. **`DayLite` volstaat.** De kaart gebruikt `fetchDailies` → `DayLite`
   (tMax, precip, snow, sunHours, sunFraction, code). Genoeg voor de good-day-test;
   de zwaardere `DailyForecast`/`scoreDay` is niet nodig. `scoreTrip`/`planTrip`
   dienen als inspiratie ("beste aaneengesloten dagen"), niet als afhankelijkheid.

---

## Laag 1 — Periode kiezen (snelknoppen **én** sleepbaar bereik)

**State.** Naast de bestaande `step: "now" | number` komt
`range: { from: number; to: number } | null` (dag-indexen in `centerDays`).
`null` = huidig één-dag-gedrag.

**Snelknoppen (chips bij de tijdlijn):**
- **"Dit weekend"** → eerstvolgende za–zo
- **"Volgende week"** → eerstvolgende ma–zo
- **"Kies dagen"** → sleepmodus zonder voorinstelling

Berekend uit de ISO-datums in `centerDays`; helper naast `fmtWeekday`
([`LiveMap.tsx:80`](app/components/LiveMap.tsx:80)).

**Sleepbaar bereik.** De `Timeline`-component
([`LiveMap.tsx:995`](app/components/LiveMap.tsx:995)) heeft al pointer-scrubbing
(`stepAtPoint`). Uitbreiden: eerste tik = `from`, slepen zet `to`. Geselecteerde
chips krijgen een doorlopende achtergrond (begin/eind afgerond) zodat het bereik
als één balk oogt. Snelknop zet het bereik, slepen finetunet — dat is "allebei".

---

## Laag 2 — Filter "over de hele periode"

**Eén nieuwe slider** in `FilterPanel`
([`LiveMap.tsx:1137`](app/components/LiveMap.tsx:1137)):
- **"Minstens ▁▂▃ goede dagen"** — `minGoodDays`, van 1 tot de lengte van het bereik.

**Nieuwe evaluatie** naast `passesWeather(dag)`:

```
goodDays = aantal dagen in [from..to] waar passesWeather(day) waar is
plaats voldoet  ⇔  goodDays ≥ minGoodDays  én  afstand ≤ maxDist
```

Dit vervangt in periode-modus de per-dag-check in de markerlus
([`LiveMap.tsx:800`](app/components/LiveMap.tsx:800)). Plaatsen die zakken →
grijs bolletje, exact zoals nu. De bestaande presets (zon/regen/sneeuw) blijven
werken en betekenen dan automatisch "genoeg zulke dagen in de periode".

---

## Laag 3 — Rangschikte top-lijst (het antwoord op de korte trip)

Nieuw uitschuifbaar paneel **"Beste bestemmingen binnen [afstand]"**, geopend via
een knop bij de bestaande ronde knoppen rechts
([`LiveMap.tsx:875`](app/components/LiveMap.tsx:875)).

### Kandidatenset — beslissing: **OPTIE B**

Twee opties werden afgewogen:

| Optie | Hoe | Oordeel |
|---|---|---|
| A — snel | Rangschik de al geladen `nearby`-plaatsen | ❌ afgewezen |
| **B — correct** | Aparte fetch: alle steden binnen de straal → `fetchDailies` → scoren | ✅ **gekozen** |

**Waarom niet A.** `nearby`
([`LiveMap.tsx:336`](app/components/LiveMap.tsx:336)) is niet "alle plaatsen
binnen X km", maar "wat nu toevallig op het scherm staat", op drie manieren
vervormd:
1. **Pixel-uitdunning** (`thinByPixels`, `MIN_PX = 56`) gooit plaatsen weg die op
   het scherm te dicht bij een andere liggen — net de beste kleine plek kan
   sneuvelen.
2. **`minPopForZoom`** filtert op inwonertal — ver uitgezoomd verdwijnen kleine
   dorpen die de beste match kunnen zijn.
3. Gekoppeld aan **viewport + zoom**, niet aan de cirkel → de lijst *verschuift bij
   elke veeg/zoom*. Dodelijk voor het vertrouwen in een "rijd hierheen"-antwoord.

**Optie B, en waarom betaalbaar.** Aparte fetch van alle steden binnen de bbox/
cirkel (spiegelt `planTrip`, [`weather.ts:718`](app/lib/weather.ts:718)) met
`DayLite` en de good-days-score. Kostenbeheersing:
- **Cache hergebruiken.** `MapEngine` cachet al weer per stad-id
  ([`LiveMap.tsx:329`](app/components/LiveMap.tsx:329)); til die cache omhoog zodat
  de lijst enkel niet-geladen plaatsen ophaalt.
- **Op aanvraag.** Pas berekenen als de gebruiker het paneel opent.
- **Begrenzen.** `fetchDailies` batcht per 50 ([`weather.ts:79`](app/lib/weather.ts:79));
  een cap zoals `MAX_CANDIDATES` (100) binnen de straal = ~2 gebatchte requests.
- **Let op inwoner-bias.** `planTrip` slice't nu op inwonertal
  ([`weather.ts:723`](app/lib/weather.ts:723)). Voor weer-jagen `minPop` laag of de
  cap wat hoger, zodat kleine (kust)plaatsen meedingen.

### Per bestemming in de lijst
- naam + afstand
- **aantal goede dagen** in de periode (bv. "4/5 dagen goed")
- gem. temp / zonuren over de goede dagen
- **beste aaneengesloten reeks** ("ma–wo ziet er top uit") — langste run
- tik → `onSelect` (bestaat al) → kaart eropheen + dagdetail

**Sortering:** goede dagen ↓, dan langste reeks ↓, dan gem. temp/zon.

---

## Laag 4 — Vergelijk landen / regio's (de verre campertoer)

Andere eenheid van antwoord (een land/regio), andere selectie (kies gebieden i.p.v.
straal-vanaf-huis), **dezelfde weerscoring** als laag 2. `City` heeft al een
`country`-veld ([`cities.ts:6`](app/lib/cities.ts:6)), dus land-aggregatie is goedkoop.

**Modus-schakelaar (overkoepelend).** Segmented control bovenaan:
- **"Binnen bereik"** → laag 1–3 (huidig gedrag + weekplanner)
- **"Vergelijk gebieden"** → laag 4 (afstandscirkel en straal-slider verdwijnen)

**Selectie-UI:**
1. **Landkiezer (primair).** Chips uit de unieke `country`-waarden in `CITIES`.
   Kies 2+. Vlag-emoji en naam zijn puur uit de ISO-2 code af te leiden — geen
   extra databestand. *Te verifiëren: is `country` een 2-lettercode of volledige
   naam? Bepaalt enkel de vlag/naam-helper.*
2. **Gebied tekenen (optioneel, later).** Rechthoek/lasso op de kaart voor
   "Zuid-Zweden vs Noord-Polen". Landkiezer dekt de basisvraag al.

**Aggregatie per gebied:**
1. Filter `CITIES` op `country` (of op de getekende bbox).
2. **Ruimtelijk gespreide steekproef**, niet blind de grootste steden (die
   clusteren in één streek) — grid over het land, één representant per cel,
   begrensd op ~30–40 punten per land.
3. `fetchDailies` over de periode → per stad `goodDays` via `passesWeather`.
4. Per land: gem. goede dagen · **% steden dat ≥ `minGoodDays` haalt** · beste
   stad (max goede dagen, dan reeks) · mediaan (anti-uitschieter).
5. Rangschik de landen op dat aggregaat.

**Resultaat — samenvattingskaarten** (best→slechtst):

> 🇵🇱 **Polen** — gem. 4,2 goede dagen · 72% steden goed · beste: Gdańsk (5/5)
> 🇸🇪 **Zweden** — gem. 2,8 goede dagen · 41% · beste: Malmö (4/5)

Tik → kaart kadert op dat land + pint de beste steden (`onSelect` → dagdetail).

**Kaartweergave:** nu haalbaar = beste steden pinnen + samenvattingskaarten.
Later (optioneel) = land inkleuren naar score (choropleth) — vergt landgrens-
geometrie die er nu níét is → bewust buiten scope.

---

## Randgevallen (overkoepelend)

- **Periode buiten forecast-horizon** (bv. "volgende week" > 14 dagen bij
  weekendstart, of campertoer weken vooruit) → periode tot de horizon knippen met
  nette melding ("verder dan ~2 weken kan het weer nog niet voorspeld worden").
  Klimaat-gemiddelden als terugval = buiten scope.
- **Lokale tijd (`timezone=auto`).** Datums per plaats kunnen 1 dag schuiven t.o.v.
  de eigen tijdzone; reeks berekenen op de lokale ISO-datum van de plaats zelf.
- **Geen enkele match** → lijst/kaart toont "Geen match — verruim afstand of
  verlaag 'goede dagen'".
- **"Nu"-stap** heeft geen betekenis in periode-modus → uitschakelen zolang een
  bereik actief is.
- **Land met weinig steden** → kleine steekproef, label "beperkte data".

---

## Waar elke wijziging landt

| Bestand | Wijziging |
|---|---|
| [`LiveMap.tsx`](app/components/LiveMap.tsx) | `range`-state, snelknoppen, sleepbereik in `Timeline`, `minGoodDays`-slider, `passesPeriod`, top-lijst-paneel (optie B), `mode`-schakelaar, landkiezer, `TIMELINE_DAYS`→14 |
| [`weather.ts`](app/lib/weather.ts) | helpers `goodDaysInRange` + `bestStreak`; `aggregateByArea` (per land) + ruimtelijke-steekproef; hergebruik `fetchDailies`. `planTrip`/`scoreTrip` afstemmen op de good-days-definitie |
| nieuw | util `country → { naam, vlag }` (puur uit ISO-2 code) |
| — | Geen nieuwe API of databron — Open-Meteo + `/api/cities` volstaan |

## Bouwvolgorde (elk apart testbaar)

1. **Laag 0–2** (horizon → bereik → good-days-filter) — fundament voor alles.
2. Daarna **laag 3 (top-lijst, optie B) en laag 4 (vergelijk) parallel** — ze
   delen de motor maar niet de UI.
3. **Modus-schakelaar** bindt beide samen.
4. Politoer: beste-reeks-blokje op de tijdlijn, lege-staat-meldingen.
