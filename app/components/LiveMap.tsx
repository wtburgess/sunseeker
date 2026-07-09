"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Icon } from "./Icon";
import {
  conditionFromCurrent,
  conditionFromDay,
  fetchCurrent,
  fetchCurrents,
  fetchDailies,
  type CurrentWeather,
  type DayLite,
  type WeatherCondition,
} from "../lib/weather";
import { type City } from "../lib/cities";
import { distanceKm } from "../lib/geo";
import { weatherGlyphSvg } from "../lib/weatherGlyphs";

type Coords = { lat: number; lon: number };
type NearbyPlace = { city: City; cur: CurrentWeather; days: DayLite[] };
/** Stap op de tijdlijn: 'now' = huidig weer, of een dag-index (0 = vandaag). */
type Step = "now" | number;

/**
 * Zoekgebied als rechthoek in smartphone-verhouding (portret): meer noord-zuid
 * dan oost-west, zodat de kaart het scherm mooi vult zonder lege hoeken.
 */
const HALF_NS_KM = 110; // halve hoogte (noord-zuid)
const HALF_EW_KM = 65; // halve breedte (oost-west)
/**
 * Max. aantal plaatsen tegelijk op de kaart. Zoom je uit, dan houden we het
 * overzichtelijk; zoom je in op een regio, dan mogen er veel meer verschijnen —
 * zo duiken ook satellietgemeenten (bv. Edegem naast Antwerpen) op.
 */
function maxNearbyForZoom(z: number): number {
  if (z >= 11) return 90;
  if (z >= 10) return 65;
  if (z >= 9) return 45;
  if (z >= 8) return 32;
  return 24;
}
/** Minimale afstand (px) tussen twee getoonde iconen, om overlap te vermijden. */
const MIN_PX = 50;
/** Aantal dagen in de tijdlijn (naast 'Nu'). */
const TIMELINE_DAYS = 10;

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { weekday: "short" });
const fmtDayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const ACCENT = "#9d3d22";

/** Grenzen van de zoekrechthoek rond een middelpunt. */
function rectBounds(center: Coords) {
  const latD = HALF_NS_KM / 111;
  const lonD = HALF_EW_KM / (111 * Math.cos((center.lat * Math.PI) / 180));
  return {
    south: center.lat - latD,
    north: center.lat + latD,
    west: center.lon - lonD,
    east: center.lon + lonD,
  };
}

/**
 * Inwoner-drempel per zoomniveau. Bewust laag: de pixel-uitdunning ontwart de
 * kaart al, dus deze drempel begrenst enkel het kandidatenvolume. Zo zie je ook
 * in dunbevolkte streken (bv. Bretagne) medium-steden, en verschijnen kleinere
 * plaatsen bij het inzoomen.
 */
function minPopForZoom(z: number): number {
  if (z >= 9) return 3_000; // dataset-ondergrens: ook kustdorpen (Carnac, Quiberon)
  if (z >= 8) return 10_000;
  if (z >= 7) return 25_000;
  if (z >= 6) return 60_000;
  return 250_000;
}

/**
 * Gedeelde stijl om de temperatuur onder elk icoon op dezelfde manier optisch te
 * centreren: full-width + gecentreerd, met een kleine padding-left die de breedte
 * van het °-teken compenseert (anders staan de cijfers net te links).
 */
const TEMP_CENTER =
  "display:block;width:100%;box-sizing:border-box;text-align:center;padding-left:0.35em;" +
  "font-family:'Archivo Narrow',sans-serif;font-weight:700;line-height:1;";

/** Marker op de huidige locatie: weericoon + temperatuur in een accent-cirkel. */
function currentIcon(cond: WeatherCondition, temp: number, struck = false) {
  const iconHtml =
    weatherGlyphSvg(cond.icon, 38, ACCENT) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:34px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:${ACCENT}">${cond.icon}</span>`;
  // Schuine streep als de eigen locatie niet aan het filter voldoet (blijft in
  // de accent-kleur — dus niet grijs, wél doorgestreept).
  const slash = struck
    ? `<svg width="62" height="62" viewBox="0 0 62 62" style="position:absolute;top:0;left:0;pointer-events:none">` +
      `<line x1="12" y1="50" x2="50" y2="12" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"/></svg>`
    : "";
  return L.divIcon({
    className: "",
    html:
      // Enkel een accent-ring rond het icoon; geen achtergrond, zodat de
      // onderliggende stad zichtbaar blijft. Icoon + temperatuur zonder schaduw.
      `<div style="position:relative;width:62px;height:62px;border-radius:50%;display:flex;` +
      `flex-direction:column;align-items:center;justify-content:center;gap:0px;` +
      `border:3px solid ${ACCENT}">` +
      iconHtml +
      `<span style="${TEMP_CENTER}font-size:19px;color:${ACCENT}">${Math.round(temp)}°</span>` +
      slash +
      `</div>`,
    iconSize: [62, 62],
    iconAnchor: [31, 31],
  });
}

/**
 * Marker voor een plaats: meerkleurig weericoon + temperatuur. De glyph draagt
 * zijn eigen kleuren; voldoet de plaats niet aan het filter, dan vervagen we het
 * hele icoon met een grijs-filter en een schuine streep.
 */
function placeIcon(cond: WeatherCondition, temp: number, dimmed: boolean) {
  const iconHtml =
    weatherGlyphSvg(cond.icon, 38, "") ??
    `<span style="font-family:'Material Symbols Outlined';font-size:34px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:#6b7075">${cond.icon}</span>`;
  const dimCss = dimmed ? "filter:grayscale(1) opacity(0.5);" : "";
  const slash = dimmed
    ? `<svg width="44" height="42" viewBox="0 0 44 42" style="position:absolute;top:-1px;left:0;pointer-events:none">` +
      `<line x1="8" y1="36" x2="36" y2="6" stroke="#6b7075" stroke-width="5" stroke-linecap="round"/></svg>`
    : "";
  return L.divIcon({
    className: "",
    html:
      `<div style="position:relative;width:44px;display:flex;flex-direction:column;align-items:center;gap:0px;${dimCss}">` +
      iconHtml +
      `<span style="${TEMP_CENTER}font-size:19px;color:#3d3d3d">${Math.round(temp)}°</span>` +
      slash +
      `</div>`,
    iconSize: [44, 60],
    iconAnchor: [22, 30],
  });
}

/**
 * Los naam-label (zwart, vet, met witte rand) dat we zélf boven de kaart tekenen
 * — de plaatsnamen in de CARTO-tegels zijn grijs en klein en niet aanpasbaar.
 * `offsetY` plaatst het label ónder het bijbehorende punt (negatief in Leaflet).
 */
function nameIcon(name: string, offsetY: number) {
  return L.divIcon({
    className: "",
    html:
      `<div style="white-space:nowrap;text-align:center;font-family:'Archivo Narrow',sans-serif;` +
      `font-weight:700;font-size:14px;line-height:1;color:#141414;` +
      `text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${name}</div>`,
    iconSize: [130, 16],
    iconAnchor: [65, offsetY],
  });
}

/** Marker-icoon voor een plaats op de gekozen tijdlijn-stap (nu of een dag). */
function iconForPlace(place: NearbyPlace, step: Step, dimmed: boolean) {
  let cond: WeatherCondition;
  let temp: number;
  if (step === "now") {
    cond = conditionFromCurrent(place.cur);
    temp = place.cur.temp;
  } else {
    const d = place.days[step];
    if (!d) return null;
    cond = conditionFromDay(d);
    temp = d.tMax;
  }
  return placeIcon(cond, temp, dimmed);
}

/**
 * Uitdunnen op schermafstand: loopt de plaatsen af (op inwonertal, hoog→laag)
 * en houdt er één als die minstens MIN_PX pixels van alle reeds gekozen iconen
 * ligt. Zo overlappen iconen nooit en verschijnt er méér detail bij inzoomen.
 */
function thinByPixels(cities: City[], map: L.Map, minPx: number, max: number) {
  const kept: City[] = [];
  const pts: L.Point[] = [];
  for (const c of cities) {
    const p = map.latLngToContainerPoint([c.lat, c.lon]);
    if (pts.every((q) => p.distanceTo(q) >= minPx)) {
      kept.push(c);
      pts.push(p);
      if (kept.length >= max) break;
    }
  }
  return kept;
}

/**
 * Kadreert de kaart op de zoekrechthoek bij een nieuw middelpunt en laadt de
 * plaatsen binnen het kaartbeeld: bij het openen, bij slepen/zoomen én meteen
 * nádat de kaart klaar is met kadreren. Dat laatste is cruciaal — anders leest
 * een zoekopdracht het kaartbeeld te vroeg (nog uitgezoomd) en verschijnt er
 * maar één icoon tot je zelf zoomt. Uitgedund op schermafstand; opgehaald weer
 * wordt gecachet zodat terugpannen niets opnieuw ophaalt.
 */
function MapEngine({
  center,
  onLoaded,
  onLoading,
}: {
  center: Coords;
  onLoaded: (places: NearbyPlace[]) => void;
  onLoading: (loading: boolean) => void;
}) {
  const map = useMap();
  const cache = useRef<Map<string, { cur: CurrentWeather; days: DayLite[] }>>(
    new Map(),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const b = map.getBounds();
    const params = new URLSearchParams({
      minLat: String(b.getSouth()),
      maxLat: String(b.getNorth()),
      minLon: String(b.getWest()),
      maxLon: String(b.getEast()),
      minPop: String(minPopForZoom(map.getZoom())),
      limit: "200",
    });

    onLoading(true);
    try {
      const res = await fetch(`/api/cities?${params.toString()}`);
      if (!res.ok) return;
      const cities: City[] = await res.json();
      const thinned = thinByPixels(
        cities,
        map,
        MIN_PX,
        maxNearbyForZoom(map.getZoom()),
      );

      const missing = thinned.filter((c) => !cache.current.has(c.id));
      if (missing.length > 0) {
        const [currents, dailies] = await Promise.all([
          fetchCurrents(missing),
          fetchDailies(missing, TIMELINE_DAYS),
        ]);
        missing.forEach((c, i) =>
          cache.current.set(c.id, { cur: currents[i], days: dailies[i] }),
        );
      }
      if (id !== reqId.current) return; // ondertussen opnieuw geladen
      onLoaded(
        thinned.map((c) => {
          const e = cache.current.get(c.id)!;
          return { city: c, cur: e.cur, days: e.days };
        }),
      );
    } catch {
      // Bijladen is optioneel; stil falen.
    } finally {
      if (id === reqId.current) onLoading(false);
    }
  }, [map, onLoaded, onLoading]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  // Slepen/zoomen door de gebruiker → herladen (met debounce).
  useMapEvents({
    moveend: () => schedule(),
    zoomend: () => schedule(),
  });

  // Nieuw middelpunt: kadreren, en pas laden zodra de kaart is uitgekaderd.
  useEffect(() => {
    let done = false;
    const runOnce = () => {
      if (done) return;
      done = true;
      load();
    };
    const b = rectBounds(center);
    map.once("moveend", runOnce);
    // Bij de eerste render kan de kaartcontainer nog geen afmetingen hebben;
    // dan berekent fitBounds een verkeerde (max-)zoom. invalidateSize() leest de
    // grootte opnieuw in vlak vóór het kadreren, zodat we altijd het regionale
    // overzicht krijgen i.p.v. volledig ingezoomd te starten.
    map.invalidateSize();
    map.fitBounds(
      [
        [b.south, b.west],
        [b.north, b.east],
      ],
      { padding: [16, 16] },
    );
    // Vangnet als de kaart al op die plek stond (geen beweging → geen moveend).
    const fallback = setTimeout(runOnce, 500);
    return () => {
      clearTimeout(fallback);
      map.off("moveend", runOnce);
    };
  }, [center, map, load]);

  // Debounce-timer opruimen bij unmount.
  useEffect(() => () => clearTimeout(timer.current), []);

  return null;
}

export default function LiveMap({
  center,
  label,
  onSelect,
}: {
  center: Coords;
  label: string;
  onSelect: (place: { name: string; lat: number; lon: number }) => void;
}) {
  const [cur, setCur] = useState<CurrentWeather | null>(null);
  const [centerDays, setCenterDays] = useState<DayLite[]>([]);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  // Tijdlijn: 'now' of een dag-index; playing = automatisch doorlopen.
  const [step, setStep] = useState<Step>("now");
  const [playing, setPlaying] = useState(false);
  // Omliggende weer-iconen tonen/verbergen (om de kale kaart te kunnen lezen).
  const [showIcons, setShowIcons] = useState(true);
  // Filter (standaardwaarden = alles zichtbaar).
  const [showFilter, setShowFilter] = useState(false);
  const [minTemp, setMinTemp] = useState(0);
  const [maxTemp, setMaxTemp] = useState(40);
  const [minSun, setMinSun] = useState(0);
  const [maxRain, setMaxRain] = useState(15);

  // Actueel weer + meerdaagse verwachting op de eigen locatie ophalen.
  useEffect(() => {
    let active = true;
    setCur(null);
    setCenterDays([]);
    Promise.all([fetchCurrent(center), fetchDailies([center], TIMELINE_DAYS)])
      .then(([c, dd]) => {
        if (!active) return;
        setCur(c);
        setCenterDays(dd[0] ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [center]);

  // Nieuw middelpunt → terug naar 'nu' en stoppen met afspelen.
  useEffect(() => {
    setStep("now");
    setPlaying(false);
  }, [center]);

  const dayCount = centerDays.length;

  // Afspelen: elke ~1,1s naar de volgende stap (nu → vandaag → … → nu).
  useEffect(() => {
    if (!playing || dayCount === 0) return;
    const id = setInterval(() => {
      // Nu → dag 0 → … → laatste → terug naar dag 0 (niet naar 'Nu').
      setStep((prev) =>
        prev === "now" ? 0 : prev + 1 >= dayCount ? 0 : prev + 1,
      );
    }, 1100);
    return () => clearInterval(id);
  }, [playing, dayCount]);

  const selectStep = (s: Step) => {
    setStep(s);
    setPlaying(false);
  };

  // Filter: max-regen op zijn hoogste stand = geen limiet.
  const effMaxRain = maxRain >= 15 ? Infinity : maxRain;
  const filterActive =
    minTemp > 0 || maxTemp < 40 || minSun > 0 || maxRain < 15;
  const passesFilter = (d: DayLite | undefined) =>
    !d ||
    (d.tMax >= minTemp &&
      d.tMax <= maxTemp &&
      d.sunHours >= minSun &&
      d.precip <= effMaxRain);

  // De eigen locatie volgt óók het filter, maar wordt niet grijs — enkel
  // doorgestreept als hij niet voldoet.
  const ownDay = step === "now" ? centerDays[0] : centerDays[step];
  const ownStruck = filterActive && !passesFilter(ownDay);

  const cond = cur ? conditionFromCurrent(cur) : null;
  const ownIcon =
    step === "now"
      ? cond && cur
        ? currentIcon(cond, cur.temp, ownStruck)
        : null
      : centerDays[step]
        ? currentIcon(
            conditionFromDay(centerDays[step]),
            centerDays[step].tMax,
            ownStruck,
          )
        : null;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <MapEngine
          center={center}
          onLoaded={setNearby}
          onLoading={setLoading}
        />

        {/* Plaatsen in beeld met hun actuele weer. De stad die met het
            middelpunt samenvalt laten we weg — anders staat er een dubbel
            icoon achter de eigen-locatie-marker. */}
        {/* Plaatsen in beeld; de stad die met het middelpunt samenvalt weglaten
            (anders staat er een dubbel icoon achter de eigen-locatie-marker). */}
        {showIcons &&
          nearby
          .filter(({ city }) => distanceKm(center, city) > 2)
          .map((place) => {
            const day = step === "now" ? place.days[0] : place.days[step];
            const dimmed = filterActive && !passesFilter(day);
            const icon = iconForPlace(place, step, dimmed);
            if (!icon) return null;
            return (
              <Marker
                key={place.city.id}
                position={[place.city.lat, place.city.lon]}
                icon={icon}
                zIndexOffset={dimmed ? -100 : 0}
                eventHandlers={{
                  click: () =>
                    onSelect({
                      name: place.city.name,
                      lat: place.city.lat,
                      lon: place.city.lon,
                    }),
                }}
              />
            );
          })}

        {/* Zelf-getekende plaatsnamen (zwart, leesbaar), altijd zichtbaar — ook
            als de weer-iconen verborgen zijn, zodat je de kaart kunt lezen. Ze
            staan iets lager als er een weer-icoon boven staat. */}
        {nearby
          .filter(({ city }) => distanceKm(center, city) > 2)
          .map((place) => (
            <Marker
              key={`lbl-${place.city.id}`}
              position={[place.city.lat, place.city.lon]}
              icon={nameIcon(place.city.name, showIcons ? -34 : 6)}
              interactive={false}
              zIndexOffset={-50}
            />
          ))}

        {/* Naam van de eigen/gezochte plaats, onder de accent-cirkel. */}
        {label && (
          <Marker
            position={[center.lat, center.lon]}
            icon={nameIcon(label, -38)}
            interactive={false}
            zIndexOffset={900}
          />
        )}

        {/* Eigen locatie bovenop. */}
        {ownIcon && (
          <Marker
            position={[center.lat, center.lon]}
            icon={ownIcon}
            zIndexOffset={1000}
            eventHandlers={{
              click: () =>
                onSelect({
                  name: label || "Mijn locatie",
                  lat: center.lat,
                  lon: center.lon,
                }),
            }}
          />
        )}
      </MapContainer>

      {/* Filterknop rechtsboven. */}
      <button
        onClick={() => setShowFilter((v) => !v)}
        aria-label="Filter"
        className={`absolute top-3 right-3 z-[1000] w-12 h-12 rounded-full flex items-center justify-center stamp-shadow active-press ${
          filterActive
            ? "bg-primary text-on-primary"
            : "bg-surface text-primary border-2 border-outline-variant"
        }`}
      >
        <Icon name="tune" filled className="text-[24px]" />
      </button>

      {/* Weer-iconen tonen/verbergen, om de kale kaart te kunnen lezen. */}
      <button
        onClick={() => setShowIcons((v) => !v)}
        aria-label={showIcons ? "Weer-iconen verbergen" : "Weer-iconen tonen"}
        className={`absolute top-[68px] right-3 z-[1000] w-12 h-12 rounded-full flex items-center justify-center stamp-shadow active-press ${
          showIcons
            ? "bg-surface text-primary border-2 border-outline-variant"
            : "bg-primary text-on-primary"
        }`}
      >
        <Icon
          name={showIcons ? "visibility" : "visibility_off"}
          filled
          className="text-[24px]"
        />
      </button>

      {showFilter && (
        <FilterPanel
          minTemp={minTemp}
          setMinTemp={setMinTemp}
          maxTemp={maxTemp}
          setMaxTemp={setMaxTemp}
          minSun={minSun}
          setMinSun={setMinSun}
          maxRain={maxRain}
          setMaxRain={setMaxRain}
          onClose={() => setShowFilter(false)}
        />
      )}

      {loading && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
          <Icon name="progress_activity" className="text-base animate-spin" />
          Weer laden…
        </div>
      )}

      <Timeline
        days={centerDays}
        step={step}
        onStep={selectStep}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
      />
    </div>
  );
}

/** Tijdlijn onderaan de kaart: ▶-afspeelknop + strook dagen (Nu, vandaag, …). */
function Timeline({
  days,
  step,
  onStep,
  playing,
  onTogglePlay,
}: {
  days: DayLite[];
  step: Step;
  onStep: (s: Step) => void;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  // Actieve chip in beeld houden (mee-scrollen als hij buiten beeld valt).
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Tijdens het scrubben (vinger over de strip) niet auto-centreren; dat zou de
  // strip onder je vinger laten verspringen. De laatst gekozen stap onthouden we
  // om dubbele updates te vermijden.
  const scrubbing = useRef(false);
  const lastStep = useRef<Step | null>(null);

  useEffect(() => {
    if (scrubbing.current) return;
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [step]);

  // Kies de dag-chip die zich onder de vinger/cursor bevindt en schuif de strip
  // aan de randen mee, zodat ook de latere dagen bereikbaar blijven.
  const stepAtPoint = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const chip = el?.closest?.("[data-step]") as HTMLElement | null;
    if (!chip) return;
    const raw = chip.dataset.step!;
    const s: Step = raw === "now" ? "now" : Number(raw);
    if (lastStep.current !== s) {
      lastStep.current = s;
      onStep(s);
    }
    const strip = stripRef.current;
    if (strip) {
      const cr = chip.getBoundingClientRect();
      const sr = strip.getBoundingClientRect();
      const EDGE = 52;
      if (cr.right > sr.right - EDGE) strip.scrollLeft += 16;
      else if (cr.left < sr.left + EDGE) strip.scrollLeft -= 16;
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-surface/95 backdrop-blur-sm border-t border-outline-variant">
      <div className="flex items-center gap-1.5 p-1.5">
        <button
          onClick={onTogglePlay}
          disabled={days.length === 0}
          aria-label={playing ? "Pauzeer" : "Speel af"}
          className="shrink-0 w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center active-press disabled:opacity-50"
        >
          <Icon name={playing ? "pause" : "play_arrow"} filled className="text-[24px]" />
        </button>
        {/* Sleep je vinger over de dagen om vlot door de verwachting te scrubben;
            tikken blijft ook gewoon werken. touchAction:none → geen native scroll
            die met het scrubben botst (we scrollen zelf mee aan de randen). */}
        <div
          ref={stripRef}
          className="flex-grow overflow-x-auto no-scrollbar flex gap-0.5 select-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            scrubbing.current = true;
            lastStep.current = null;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            stepAtPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) stepAtPoint(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
          }}
        >
          <Chip
            stepValue="now"
            active={step === "now"}
            innerRef={step === "now" ? activeRef : undefined}
            label="Nu"
            sub=""
          />
          {days.map((d, i) => (
            <Chip
              key={d.date}
              stepValue={i}
              active={step === i}
              innerRef={step === i ? activeRef : undefined}
              label={fmtWeekday(d.date)}
              sub={fmtDayMonth(d.date)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  innerRef,
  stepValue,
  label,
  sub,
}: {
  active: boolean;
  innerRef?: Ref<HTMLButtonElement>;
  stepValue: Step;
  label: string;
  sub: string;
}) {
  return (
    <button
      ref={innerRef}
      data-step={stepValue}
      className={`shrink-0 min-w-[38px] px-1 py-1 rounded-md text-center leading-none active-press transition-colors ${
        active
          ? "bg-primary text-on-primary"
          : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      <div className="font-headline-sm text-[16px] uppercase capitalize">
        {label}
      </div>
      <div className="text-[12px] mt-0.5 h-3.5">{sub}</div>
    </button>
  );
}

/** Filterpaneel (bottom sheet). Wijzigingen werken de kaart meteen bij. */
function FilterPanel({
  minTemp,
  setMinTemp,
  maxTemp,
  setMaxTemp,
  minSun,
  setMinSun,
  maxRain,
  setMaxRain,
  onClose,
}: {
  minTemp: number;
  setMinTemp: (v: number) => void;
  maxTemp: number;
  setMaxTemp: (v: number) => void;
  minSun: number;
  setMinSun: (v: number) => void;
  maxRain: number;
  setMaxRain: (v: number) => void;
  onClose: () => void;
}) {
  const reset = () => {
    setMinTemp(0);
    setMaxTemp(40);
    setMinSun(0);
    setMaxRain(15);
  };
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] bg-surface border-t-2 border-outline-variant rounded-t-2xl stamp-shadow max-h-[80%] overflow-y-auto animate-fade-in">
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 h-14 bg-surface border-b-2 border-outline-variant">
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded-lg font-headline-sm text-[16px] uppercase text-primary hover:bg-surface-container-high active-press"
        >
          Reset
        </button>
        <span className="font-headline-md text-headline-md uppercase tracking-wide flex items-center gap-1.5">
          <Icon name="tune" filled className="text-primary text-[24px]" /> Filter
        </span>
        <button
          onClick={onClose}
          className="px-5 py-1.5 rounded-lg bg-primary text-on-primary font-headline-sm text-[16px] uppercase active-press"
        >
          OK
        </button>
      </div>

      <div className="pb-4">
        <GroupLabel>Temperatuur</GroupLabel>
        <FilterRow
          title="Minimum"
          info="De laagste maximumtemperatuur van de dag. Plaatsen waar het overdag kouder blijft dan dit, vervagen."
          display={`${minTemp}°`}
          value={minTemp}
          min={0}
          max={40}
          step={1}
          onChange={setMinTemp}
        />
        <FilterRow
          title="Maximum"
          info="De hoogste maximumtemperatuur van de dag. Plaatsen waar het overdag warmer wordt dan dit, vervagen."
          display={maxTemp >= 40 ? "40°+" : `${maxTemp}°`}
          value={maxTemp}
          min={0}
          max={40}
          step={1}
          onChange={setMaxTemp}
        />

        <GroupLabel>Zon</GroupLabel>
        <FilterRow
          title="Min. zonuren"
          info="Aantal uren zon per dag. Vanaf 8 zonuren heb je een goeie dag."
          display={`${minSun} u`}
          value={minSun}
          min={0}
          max={14}
          step={1}
          onChange={setMinSun}
        />

        <GroupLabel>Regen</GroupLabel>
        <FilterRow
          title="Max. regen"
          info="Totale regen over de hele dag. 0 mm = droog · 1–2 mm = een spatje · 5 mm+ = echt nat. Plaatsen met méér regen vervagen."
          display={maxRain >= 15 ? "alles" : `${maxRain} mm`}
          value={maxRain}
          min={0}
          max={15}
          step={1}
          onChange={setMaxRain}
        />
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div className="px-4 pt-3 pb-1 font-headline-sm text-[15px] uppercase tracking-widest text-outline">
      {children}
    </div>
  );
}

function FilterRow({
  title,
  info,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  title: string;
  info: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-headline-sm text-[19px] uppercase truncate">
            {title}
          </span>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Uitleg"
            className={`shrink-0 active-press ${
              showInfo ? "text-primary" : "text-outline hover:text-primary"
            }`}
          >
            <Icon name="info" filled={showInfo} className="text-[22px]" />
          </button>
        </div>
        <span className="font-headline-sm text-[22px] text-primary shrink-0">
          {display}
        </span>
      </div>
      {showInfo && (
        <p className="text-[14px] leading-snug text-on-surface-variant mt-1">
          {info}
        </p>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5"
      />
    </div>
  );
}
