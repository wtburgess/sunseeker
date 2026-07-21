"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Icon } from "./Icon";
import { RainOverlay } from "./RainOverlay";
import {
  conditionFromCurrent,
  conditionFromDay,
  fetchCurrent,
  fetchCurrents,
  fetchDailies,
  fetchMinutelyForecast,
  type CurrentWeather,
  type DayLite,
  type MinutelyData,
  type WeatherCondition,
} from "../lib/weather";
import { type City } from "../lib/cities";
import { type Favorite } from "../lib/favorites";
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
/** Hoeveel groter de weericonen in de favorieten-weergave staan: er staan er
 *  veel minder tegelijk, dus ze mogen prominenter. */
const FAV_ICON_SCALE = 1.2;
/** Lichte vergroting voor de normale kaartweergave — subtieler dan bij de
 *  favorieten, want hier staan er veel meer iconen tegelijk. */
const MAP_ICON_SCALE = 1.15;

/** Grenzen voor de max-afstand-schuifbalk (km). MAX = onbeperkt (geen cirkel). */
const FILTER_DIST_MIN = 10;
const FILTER_DIST_MAX = 3000;
/** Niet-lineaire stappen: fijn dichtbij, grover naarmate de afstand groeit.
 *  Eerste = FILTER_DIST_MIN, laatste = FILTER_DIST_MAX (onbeperkt). */
const DIST_STEPS = [
  10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000,
  2500, 3000,
];
/**
 * Max. aantal plaatsen tegelijk op de kaart. Rustiger bij lage/normale zoom
 * (minder druk, past bij de grotere iconen), maar bij inzoomen mogen er nog
 * steeds veel verschijnen — zo duiken ook satellietgemeenten op (bv. Edegem
 * naast Antwerpen) en oogt een land als Frankrijk niet leeg.
 */
function maxNearbyForZoom(z: number): number {
  if (z >= 11) return 90;
  if (z >= 10) return 65;
  if (z >= 9) return 48;
  if (z >= 8) return 30; // standaard opstart-zoom: rustiger beeld
  return 22; // ver uitgezoomd (continentaal overzicht)
}
/** Minimale afstand (px) tussen twee getoonde iconen, om overlap te vermijden.
 *  Iets ruimer dan het icoon breed is (bij MAP_ICON_SCALE), zodat ze nooit
 *  raken. */
const MIN_PX = 56;
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
function currentIcon(
  cond: WeatherCondition,
  temp: number,
  struck = false,
  scale = 1,
) {
  const glyphPx = Math.round(38 * scale);
  // Zelfde compacte zon als de gewone plaats-markers: grote schijf, korte
  // stralen, zodat de temperatuur er leesbaar overheen kan.
  const glyphName = cond.icon === "sky_0" ? "sky_0_map" : cond.icon;
  const iconHtml =
    weatherGlyphSvg(glyphName, glyphPx, ACCENT) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:${Math.round(34 * scale)}px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:${ACCENT}">${cond.icon}</span>`;
  const tempPx = Math.round(15 * scale);
  // Ring hoeft nu enkel het icoon te omvatten (temperatuur zit ín het icoon,
  // niet er los onder), dus een stuk krapper dan toen er twee regels in pasten.
  const d = glyphPx + 12;
  // Schuine streep als de eigen locatie niet aan het filter voldoet (blijft in
  // de accent-kleur — dus niet grijs, wél doorgestreept).
  const slash = struck
    ? `<svg width="${d}" height="${d}" viewBox="0 0 62 62" style="position:absolute;top:0;left:0;pointer-events:none">` +
      `<line x1="12" y1="50" x2="50" y2="12" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"/></svg>`
    : "";
  return L.divIcon({
    className: "",
    html:
      // Enkel een accent-ring rond het icoon; geen achtergrond, zodat de
      // onderliggende stad zichtbaar blijft.
      `<div style="position:relative;width:${d}px;height:${d}px;border-radius:50%;display:flex;` +
      `align-items:center;justify-content:center;border:3px solid ${ACCENT}">` +
      `<div style="position:relative;width:${glyphPx}px;height:${glyphPx}px;display:flex;align-items:center;justify-content:center;">` +
      iconHtml +
      // z-index nodig: Leaflet zet elke SVG boven een gewoon absolute element
      // (.leaflet-map-pane svg { z-index: 200 }) — anders verdwijnt het cijfer
      // achter het icoon.
      `<span style="position:absolute;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;` +
      `font-family:'Archivo Narrow',sans-serif;font-weight:800;font-size:${tempPx}px;line-height:1;color:#fff;` +
      `text-shadow:0 1px 2px rgba(0,0,0,.55),0 0 3px rgba(0,0,0,.35)${temp < 0 ? ";margin-top:2px" : ""}">${Math.round(temp)}°</span>` +
      `</div>` +
      slash +
      `</div>`,
    iconSize: [d, d],
    iconAnchor: [Math.round(d / 2), Math.round(d / 2)],
  });
}

/**
 * Marker voor een plaats: meerkleurig weericoon + temperatuur. De glyph draagt
 * zijn eigen kleuren; voldoet de plaats niet aan het filter, dan vervagen we het
 * hele icoon met een grijs-filter en een schuine streep. `scale` maakt het hele
 * icoon groter (gebruikt in de favorieten-weergave, waar er veel minder
 * markers tegelijk staan en meer ruimte is om ze prominent te tonen).
 */
function placeIcon(
  cond: WeatherCondition,
  temp: number,
  dimmed: boolean,
  scale = 1,
) {
  // Plaatsen die niet aan het filter voldoen: geen vol weericoon meer, maar een
  // klein grijs puntje. Dat ontrommelt de kaart maximaal en toont toch subtiel
  // dat er een (uitgefilterde) plaats zit.
  if (dimmed) {
    const dot = Math.round(7 * scale);
    const box = dot + 4;
    const c = box / 2;
    const r = dot / 2;
    return L.divIcon({
      className: "",
      html:
        `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">` +
        `<circle cx="${c}" cy="${c}" r="${r}" fill="#9aa0a6"/></svg>`,
      iconSize: [box, box],
      iconAnchor: [Math.round(c), Math.round(c)],
    });
  }

  const glyphPx = Math.round(38 * scale);
  // Bij volle zon de compacte kaart-variant (grote schijf, korte stralen) —
  // die laat, anders dan de gewone sky_0, genoeg solide vlak vrij om de
  // temperatuur er leesbaar overheen te zetten.
  const glyphName = cond.icon === "sky_0" ? "sky_0_map" : cond.icon;
  const iconHtml =
    weatherGlyphSvg(glyphName, glyphPx, "") ??
    `<span style="font-family:'Material Symbols Outlined';font-size:${Math.round(34 * scale)}px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:#6b7075">${cond.icon}</span>`;
  const w = Math.round(44 * scale);
  const tempPx = Math.round(15 * scale);
  // Temperatuur bovenop het icoon (niet eronder): wit met een donkere schaduw,
  // zodat het cijfer op elke ondergrond (amber zon, grijze wolk, blauwe regen…)
  // goed afsteekt. Scheelt een hele tekstregel, dus de naam komt vlak onder het
  // icoon te staan.
  return L.divIcon({
    className: "",
    html:
      `<div style="position:relative;width:${w}px;height:${glyphPx}px;display:flex;align-items:center;justify-content:center;">` +
      iconHtml +
      // z-index nodig: Leaflet zet via `.leaflet-map-pane svg { z-index: 200 }`
      // élke SVG (ook onze glyph, als flex-item) boven een gewoon absolute
      // positioned element — zonder dit zou de temperatuur achter het icoon
      // verdwijnen ondanks dat de span later in de DOM staat.
      `<span style="position:absolute;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;` +
      `font-family:'Archivo Narrow',sans-serif;font-weight:800;font-size:${tempPx}px;line-height:1;color:#fff;` +
      `text-shadow:0 1px 2px rgba(0,0,0,.55),0 0 3px rgba(0,0,0,.35)${temp < 0 ? ";margin-top:2px" : ""}">${Math.round(temp)}°</span>` +
      `</div>`,
    iconSize: [w, glyphPx],
    iconAnchor: [Math.round(w / 2), Math.round(glyphPx / 2)],
  });
}

/** Verticale offset voor het naamlabel onder een `placeIcon`-marker: net onder
 *  het icoon (de temperatuur zit ín het icoon), met een minimale kier (2px). */
function placeLabelOffsetY(scale = 1): number {
  const glyphPx = Math.round(38 * scale);
  return -(glyphPx - Math.round(glyphPx / 2) + 2);
}

/** Zelfde, maar voor het naamlabel onder de accent-ring (`currentIcon`). */
function currentLabelOffsetY(scale = 1): number {
  const d = Math.round(38 * scale) + 12;
  return -(d - Math.round(d / 2) + 2);
}

/**
 * Los naam-label (zwart, vet, met witte rand) dat we zélf boven de kaart tekenen
 * — de plaatsnamen in de CARTO-tegels zijn grijs en klein en niet aanpasbaar.
 * `offsetY` plaatst het label ónder het bijbehorende punt (negatief in Leaflet).
 */
function nameIcon(name: string, offsetY: number, scale = 1) {
  const fontPx = Math.round(14 * scale);
  const w = Math.round(130 * scale);
  const h = Math.round(16 * scale);
  return L.divIcon({
    className: "",
    html:
      `<div style="white-space:nowrap;text-align:center;font-family:'Archivo Narrow',sans-serif;` +
      `font-weight:700;font-size:${fontPx}px;line-height:1;color:#141414;` +
      `text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${name}</div>`,
    iconSize: [w, h],
    iconAnchor: [Math.round(w / 2), offsetY],
  });
}

/** Marker-icoon voor een plaats op de gekozen tijdlijn-stap (nu of een dag). */
function iconForPlace(
  place: NearbyPlace,
  step: Step,
  dimmed: boolean,
  scale = 1,
) {
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
  return placeIcon(cond, temp, dimmed, scale);
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
  onSlowNetwork,
}: {
  center: Coords;
  onLoaded: (places: NearbyPlace[]) => void;
  onLoading: (loading: boolean) => void;
  onSlowNetwork: (isSlow: boolean) => void;
}) {
  const map = useMap();
  const cache = useRef<Map<string, { cur: CurrentWeather; days: DayLite[] }>>(
    new Map(),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    clearTimeout(slowTimer.current);
    onSlowNetwork(false);

    // Na 5 seconden: als nog steeds aan het laden, schakel naar favorieten
    slowTimer.current = setTimeout(() => {
      if (id === reqId.current) onSlowNetwork(true);
    }, 5000);

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
      if (id === reqId.current) {
        onLoading(false);
        clearTimeout(slowTimer.current);
        onSlowNetwork(false);
      }
    }
  }, [map, onLoaded, onLoading, onSlowNetwork]);

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

/**
 * Houdt een verwijzing naar de kaart bij (voor de eigen +/–-knoppen) en meldt
 * het actuele zoomniveau terug, zodat we het cijfer onder de zoomknoppen kunnen
 * tonen en bij elke zoomwijziging bijwerken.
 */
function ZoomTracker({
  mapRef,
  setZoom,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  setZoom: (z: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    setZoom(Math.round(map.getZoom()));
  }, [map, mapRef, setZoom]);
  useMapEvents({ zoomend: () => setZoom(Math.round(map.getZoom())) });
  return null;
}

type FavPlace = { fav: Favorite; cur: CurrentWeather; days: DayLite[] };

export default function LiveMap({
  center,
  label,
  favorites,
  onSelect,
}: {
  center: Coords;
  label: string;
  favorites: Favorite[];
  onSelect: (place: { name: string; lat: number; lon: number }) => void;
}) {
  const [cur, setCur] = useState<CurrentWeather | null>(null);
  const [centerDays, setCenterDays] = useState<DayLite[]>([]);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [slowNetworkDetected, setSlowNetworkDetected] = useState(false);
  const [minutelyData, setMinutelyData] = useState<MinutelyData | null>(null);
  const [showRainOverlay, setShowRainOverlay] = useState(false);
  // Tijdlijn: 'now' of een dag-index; playing = automatisch doorlopen.
  const [step, setStep] = useState<Step>("now");
  const [playing, setPlaying] = useState(false);
  // Kaart-verwijzing + actueel zoomniveau (voor de eigen zoombediening).
  const mapRef = useRef<L.Map | null>(null);
  const [zoom, setZoom] = useState(8);
  // "Alleen favorieten"-weergave: enkel de bewaarde plaatsen (met hun weer).
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favPlaces, setFavPlaces] = useState<FavPlace[]>([]);
  // Filter (standaardwaarden = alles zichtbaar).
  const [showFilter, setShowFilter] = useState(false);
  const [minTemp, setMinTemp] = useState(0);
  const [maxTemp, setMaxTemp] = useState(40);
  const [minSun, setMinSun] = useState(0);
  const [maxRain, setMaxRain] = useState(15);
  const [minRain, setMinRain] = useState(0);
  const [minSnow, setMinSnow] = useState(0);
  // Max. afstand vanaf de gezochte plaats (10–3000 km); MAX = onbeperkt.
  const [maxDist, setMaxDist] = useState(FILTER_DIST_MAX);

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

  // Minutely regenvoorzpelling ophalen
  useEffect(() => {
    let active = true;
    fetchMinutelyForecast(center)
      .then((data) => {
        if (!active) return;
        setMinutelyData(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [center]);

  // Nieuw middelpunt → terug naar 'nu' en stoppen met afspelen. De
  // favorieten-weergave blijft bewust staan tot je zelf op het hartje tikt.
  useEffect(() => {
    setStep("now");
    setPlaying(false);
    setSlowNetworkDetected(false);
  }, [center]);

  // Langzaam netwerk gedetecteerd → auto-switch naar favorieten als beschikbaar
  useEffect(() => {
    if (slowNetworkDetected && favorites.length > 0 && !favoritesOnly) {
      setFavoritesOnly(true);
    }
  }, [slowNetworkDetected, favorites.length, favoritesOnly]);

  // Weer (nu + meerdaags) van de favorieten ophalen zodra de favorieten-weergave
  // aanstaat; buiten die weergave houden we niets bij.
  useEffect(() => {
    if (!favoritesOnly || favorites.length === 0) {
      setFavPlaces([]);
      return;
    }
    let active = true;
    Promise.all([
      fetchCurrents(favorites),
      fetchDailies(favorites, TIMELINE_DAYS),
    ])
      .then(([currents, dailies]) => {
        if (!active) return;
        setFavPlaces(
          favorites.map((f, i) => ({ fav: f, cur: currents[i], days: dailies[i] })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [favoritesOnly, favorites]);

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

  // Favorieten-weergave aan/uit. Bij aanzetten kadert de kaart passend op alle
  // favorieten, zodat je ze in één oogopslag ziet.
  const toggleFavoritesOnly = () => {
    if (favoritesOnly) {
      setFavoritesOnly(false);
      return;
    }
    setFavoritesOnly(true);
    const m = mapRef.current;
    if (!m || favorites.length === 0) return;
    if (favorites.length === 1) {
      m.setView([favorites[0].lat, favorites[0].lon], 9);
    } else {
      m.fitBounds(
        favorites.map((f) => [f.lat, f.lon] as [number, number]),
        { padding: [50, 50], maxZoom: 9 },
      );
    }
  };

  // Filter: max-regen op zijn hoogste stand = geen limiet.
  const effMaxRain = maxRain >= 15 ? Infinity : maxRain;
  const distLimited = maxDist < FILTER_DIST_MAX;
  const filterActive =
    minTemp > 0 ||
    maxTemp < 40 ||
    minSun > 0 ||
    maxRain < 15 ||
    minRain > 0 ||
    minSnow > 0 ||
    distLimited;
  // Weer-gebonden voorwaarden (afstand komt er los bij, want die hangt van de
  // plaats af, niet van de dag).
  const passesWeather = (d: DayLite | undefined) =>
    !d ||
    (d.tMax >= minTemp &&
      d.tMax <= maxTemp &&
      d.sunHours >= minSun &&
      d.precip <= effMaxRain &&
      d.precip >= minRain &&
      (d.snow ?? 0) >= minSnow);
  const passesFilter = (d: DayLite | undefined, distKm = 0) =>
    passesWeather(d) && (!distLimited || distKm <= maxDist);

  // De eigen locatie volgt óók het filter, maar wordt niet grijs — enkel
  // doorgestreept als hij niet voldoet.
  const ownDay = step === "now" ? centerDays[0] : centerDays[step];
  const ownStruck = filterActive && !passesFilter(ownDay);

  const cond = cur ? conditionFromCurrent(cur) : null;
  const ownIcon =
    step === "now"
      ? cond && cur
        ? currentIcon(cond, cur.temp, ownStruck, MAP_ICON_SCALE)
        : null
      : centerDays[step]
        ? currentIcon(
            conditionFromDay(centerDays[step]),
            centerDays[step].tMax,
            ownStruck,
            MAP_ICON_SCALE,
          )
        : null;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <ZoomTracker mapRef={mapRef} setZoom={setZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <MapEngine
          center={center}
          onLoaded={setNearby}
          onLoading={setLoading}
          onSlowNetwork={setSlowNetworkDetected}
        />

        {/* Omtrekcirkel van de max-afstand vanaf de gezochte plaats. */}
        {filterActive && distLimited && (
          <Circle
            center={[center.lat, center.lon]}
            radius={maxDist * 1000}
            interactive={false}
            pathOptions={{
              color: ACCENT,
              weight: 2,
              dashArray: "6 6",
              fill: false,
            }}
          />
        )}

        {/* Langzaam netwerk: boodschap en auto-switch naar favorieten */}
        {slowNetworkDetected && !favoritesOnly && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            pointerEvents: "none",
          }}>
            <div style={{
              textAlign: "center",
              padding: "2rem",
              maxWidth: "300px",
            }}>
              <p style={{ fontSize: "16px", fontWeight: "600", marginBottom: "0.5rem" }}>
                Langzaam netwerk
              </p>
              <p style={{ fontSize: "14px", color: "#666", marginBottom: "1rem" }}>
                De kaart laadt nog. Je favorieten zijn beschikbaar.
              </p>
              <button
                onClick={() => setFavoritesOnly(true)}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#9d3d22",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Toon favorieten
              </button>
            </div>
          </div>
        )}

        {favoritesOnly ? (
          <>
            {/* Alleen de favorieten, met het weer van de gekozen dag. */}
            {favPlaces.map(({ fav, cur: fcur, days }) => {
                let fcond: WeatherCondition;
                let temp: number;
                if (step === "now") {
                  if (!fcur) return null;
                  fcond = conditionFromCurrent(fcur);
                  temp = fcur.temp;
                } else {
                  const d = days?.[step];
                  if (!d) return null;
                  fcond = conditionFromDay(d);
                  temp = d.tMax;
                }
                return (
                  <Marker
                    key={`fav-${fav.name}-${fav.lat}`}
                    position={[fav.lat, fav.lon]}
                    icon={placeIcon(fcond, temp, false, FAV_ICON_SCALE)}
                    eventHandlers={{
                      click: () =>
                        onSelect({ name: fav.name, lat: fav.lat, lon: fav.lon }),
                    }}
                  />
                );
              })}
            {favPlaces.map(({ fav }) => (
              <Marker
                key={`favlbl-${fav.name}-${fav.lat}`}
                position={[fav.lat, fav.lon]}
                icon={nameIcon(fav.name, placeLabelOffsetY(FAV_ICON_SCALE), FAV_ICON_SCALE)}
                interactive={false}
                zIndexOffset={-50}
              />
            ))}

            {/* Namen van de overige steden in beeld (geen weericoon, enkel de
                naam) — zo houd je context bij je favorieten, zoals vroeger het
                oog-icoon deed voor de gewone kaart. Favorieten zelf overslaan,
                anders staat er een dubbel label op dezelfde plek. */}
            {nearby
              .filter(
                ({ city }) =>
                  !favorites.some((f) => distanceKm(city, f) < 2),
              )
              .map((place) => (
                <Marker
                  key={`ctxlbl-${place.city.id}`}
                  position={[place.city.lat, place.city.lon]}
                  icon={nameIcon(place.city.name, 6)}
                  interactive={false}
                  zIndexOffset={-100}
                />
              ))}
          </>
        ) : (
          <>
            {/* Plaatsen in beeld; de stad die met het middelpunt samenvalt
                weglaten (anders een dubbel icoon achter de eigen-locatie). */}
            {nearby
              .filter(({ city }) => distanceKm(center, city) > 2)
              .map((place) => {
                  const day = step === "now" ? place.days[0] : place.days[step];
                  const dist = distanceKm(center, place.city);
                  // Buiten de afstandscirkel: geen weericoon meer (enkel de naam
                  // blijft, uit de aparte namen-laag hieronder).
                  if (distLimited && dist > maxDist) return null;
                  // Binnen de cirkel maar niet aan het weerfilter: grijs puntje.
                  const dimmed = filterActive && !passesWeather(day);
                  const icon = iconForPlace(place, step, dimmed, MAP_ICON_SCALE);
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

            {/* Zelf-getekende plaatsnamen (zwart), altijd zichtbaar — ook als
                de weer-iconen verborgen zijn, zodat je de kaart kunt lezen. */}
            {nearby
              .filter(({ city }) => distanceKm(center, city) > 2)
              .map((place) => (
                <Marker
                  key={`lbl-${place.city.id}`}
                  position={[place.city.lat, place.city.lon]}
                  icon={nameIcon(place.city.name, placeLabelOffsetY(MAP_ICON_SCALE), MAP_ICON_SCALE)}
                  interactive={false}
                  zIndexOffset={-50}
                />
              ))}

            {/* Naam van de eigen/gezochte plaats, onder de accent-cirkel. */}
            {label && (
              <Marker
                position={[center.lat, center.lon]}
                icon={nameIcon(label, currentLabelOffsetY(MAP_ICON_SCALE), MAP_ICON_SCALE)}
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
          </>
        )}
      </MapContainer>

      {/* Alleen favorieten tonen (enkel zichtbaar als je favorieten hebt). */}
      {favorites.length > 0 && (
        <button
          onClick={toggleFavoritesOnly}
          aria-label={
            favoritesOnly ? "Toon alle plaatsen" : "Toon alleen favorieten"
          }
          className={`absolute top-[69px] right-3 z-[1000] w-12 h-12 rounded-full flex items-center justify-center stamp-shadow active-press ${
            favoritesOnly
              ? "bg-primary text-on-primary"
              : "bg-surface text-primary border-2 border-outline-variant"
          }`}
        >
          <Icon name="favorite" filled={false} className="text-[24px]" />
        </button>
      )}

      {/* Filterknop, onder het hartje. Actief filter = invers: rode vulling met
          witte streepjes, zodat meteen duidelijk is dat er een filter aanstaat. */}
      <button
        onClick={() => setShowFilter((v) => !v)}
        aria-label="Filter"
        className={`absolute z-[1000] w-12 h-12 rounded-full border-2 flex items-center justify-center stamp-shadow active-press ${
          favorites.length > 0 ? "top-[125px]" : "top-[69px]"
        } right-3 ${
          filterActive
            ? "bg-error border-error text-white"
            : "bg-surface border-outline-variant text-primary"
        }`}
      >
        <Icon name="tune" filled className="text-[24px]" />
      </button>

      {/* Regenradar-knop */}
      <button
        onClick={() => setShowRainOverlay((v) => !v)}
        aria-label="Regenvoorspelling"
        title="Regenvoorspelling volgende uur"
        className={`absolute z-[1000] w-12 h-12 rounded-full flex items-center justify-center stamp-shadow active-press ${
          favorites.length > 0 ? "top-[181px]" : "top-[125px]"
        } right-3 ${
          showRainOverlay
            ? "bg-primary text-on-primary"
            : "bg-surface text-primary border-2 border-outline-variant"
        }`}
      >
        <Icon name="raindrops" className="text-[24px]" />
      </button>

      {/* Eigen zoombediening: +/– met het actuele zoomniveau eronder. */}
      <div className="absolute top-[69px] left-3 z-[1000] flex flex-col items-stretch rounded-lg overflow-hidden border-2 border-outline-variant bg-surface stamp-shadow">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Inzoomen"
          className="w-10 h-10 flex items-center justify-center text-primary active-press"
        >
          <Icon name="add" className="text-[24px]" />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Uitzoomen"
          className="w-10 h-10 flex items-center justify-center text-primary active-press border-t border-outline-variant"
        >
          <Icon name="remove" className="text-[24px]" />
        </button>
        {/* Zoomniveau relatief getoond: zoom 5 = 0, van daaruit +/-. */}
        <div className="h-7 flex items-center justify-center text-[18px] font-headline-sm tabular-nums text-on-surface-variant border-t border-outline-variant bg-surface-container-high">
          {zoom - 5 > 0 ? `+${zoom - 5}` : `${zoom - 5}`}
        </div>
      </div>

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
          minRain={minRain}
          setMinRain={setMinRain}
          minSnow={minSnow}
          setMinSnow={setMinSnow}
          maxDist={maxDist}
          setMaxDist={setMaxDist}
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

      {/* Regenradar overlay — zweeft net onder de drie ronde knoppen rechts
          (die zakken mee als er favorieten zijn, dus het startpunt ook). */}
      {showRainOverlay && (
        <RainOverlay
          data={minutelyData}
          onClose={() => setShowRainOverlay(false)}
          location={label}
          topPx={favorites.length > 0 ? 237 : 181}
        />
      )}
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
    <div className="absolute top-0 left-0 right-0 z-[1000] bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
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
  minRain,
  setMinRain,
  minSnow,
  setMinSnow,
  maxDist,
  setMaxDist,
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
  minRain: number;
  setMinRain: (v: number) => void;
  minSnow: number;
  setMinSnow: (v: number) => void;
  maxDist: number;
  setMaxDist: (v: number) => void;
  onClose: () => void;
}) {
  const reset = () => {
    setMinTemp(0);
    setMaxTemp(40);
    setMinSun(0);
    setMaxRain(15);
    setMinRain(0);
    setMinSnow(0);
    setMaxDist(FILTER_DIST_MAX);
  };
  // Snelkeuzes: zetten de weer-schuifbalken in één tik zodat de kaart net die
  // plaatsen toont die het gekozen icoon opleveren (afstand blijft ongemoeid).
  const preset = (kind: "sun" | "rain" | "snow") => {
    setMinTemp(0);
    setMaxTemp(40);
    setMinSun(0);
    setMaxRain(15);
    setMinRain(0);
    setMinSnow(0);
    if (kind === "sun") {
      setMinSun(7); // volle zon of "zon met een kleine wolk"
      setMaxRain(1); // en droog, zodat het zon-icoon blijft
    } else if (kind === "rain") {
      setMinRain(1); // vanaf een natte dag verschijnt het regenicoon
    } else {
      setMinSnow(1); // vanaf 1 cm sneeuwval verschijnt het sneeuwicoon
    }
  };
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] bg-surface border-t-2 border-outline-variant rounded-t-2xl stamp-shadow max-h-[80%] overflow-y-auto animate-fade-in">
      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 h-14 bg-surface border-b-2 border-outline-variant">
        <button
          onClick={reset}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-primary text-on-primary font-headline-sm text-[13px] uppercase active-press"
        >
          Reset
        </button>
        {/* Presets: zon / regen / sneeuw — het weericoon zelf als knop. */}
        <span className="shrink-0 ml-3 font-headline-sm text-[16px] font-bold uppercase tracking-wide text-on-surface">
          Presets
        </span>
        <div className="flex items-center gap-1 ml-2">
          <PresetButton glyph="sky_0" label="Zon" onClick={() => preset("sun")} />
          <PresetButton glyph="rain_2" label="Regen" onClick={() => preset("rain")} />
          <PresetButton glyph="snow_2" label="Sneeuw" onClick={() => preset("snow")} />
        </div>
        <button
          onClick={onClose}
          className="ml-auto shrink-0 px-3 py-1 rounded-lg bg-primary text-on-primary font-headline-sm text-[13px] uppercase active-press"
        >
          OK
        </button>
      </div>

      <div className="py-2">
        <FilterRow
          icon="straighten"
          title="Afstand"
          info="Toon enkel plaatsen binnen deze straal vanaf de gezochte plaats. Er wordt een cirkel op de kaart getekend."
          display={maxDist >= FILTER_DIST_MAX ? "onbeperkt" : `${maxDist} km`}
          value={maxDist}
          min={FILTER_DIST_MIN}
          max={FILTER_DIST_MAX}
          step={10}
          steps={DIST_STEPS}
          onChange={setMaxDist}
        />

        <TempPair
          minTemp={minTemp}
          setMinTemp={setMinTemp}
          maxTemp={maxTemp}
          setMaxTemp={setMaxTemp}
        />

        <FilterRow
          icon="sky_0"
          title="Min. zonuren"
          info="Aantal uren zon per dag. Vanaf 8 zonuren heb je een goeie dag."
          display={`${minSun} u`}
          value={minSun}
          min={0}
          max={14}
          step={1}
          onChange={setMinSun}
        />

        <FilterRow
          icon="rain_2"
          title="Max. regen"
          info="Totale regen over de hele dag. 0 mm = droog · 1–2 mm = een spatje · 5 mm+ = echt nat. Plaatsen met méér regen vervagen."
          display={maxRain >= 15 ? "alles" : `${maxRain} mm`}
          value={maxRain}
          min={0}
          max={15}
          step={1}
          onChange={setMaxRain}
        />
        <FilterRow
          icon="rain_2"
          title="Min. regen"
          info="Zoek juist naar regen: plaatsen met mínder regen dan dit vervagen. 1 mm+ = een natte dag."
          display={`${minRain} mm`}
          value={minRain}
          min={0}
          max={15}
          step={1}
          onChange={setMinRain}
        />

        <FilterRow
          icon="snow_2"
          title="Min. sneeuw"
          info="Zoek naar sneeuw: plaatsen met mínder sneeuwval dan dit vervagen. 1 cm+ = een besneeuwde dag."
          display={`${minSnow} cm`}
          value={minSnow}
          min={0}
          max={20}
          step={1}
          onChange={setMinSnow}
        />
      </div>
    </div>
  );
}

/** Preset-knop in de filter-header: het weericoon zelf als ronde knop. */
function PresetButton({
  glyph,
  label,
  onClick,
}: {
  glyph: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Preset: ${label}`}
      title={label}
      className="w-12 h-12 shrink-0 rounded-full border-2 border-outline-variant bg-surface flex items-center justify-center hover:bg-surface-container-high active-press"
    >
      <Icon name={glyph} className="text-[30px]" />
    </button>
  );
}


function FilterRow({
  icon,
  title,
  info,
  display,
  value,
  min,
  max,
  step,
  steps,
  onChange,
}: {
  icon: string; // voor-icoon dat de groep aanduidt (i.p.v. een tekst-titel)
  title?: string; // optioneel kort label (bv. "Min"/"Max") waar dat verschil telt
  info: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  steps?: number[]; // niet-lineaire waarden; schuifbalk loopt dan over de index
  onChange: (v: number) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  // Met `steps` schuift de balk over de index (gelijke stapjes op het scherm),
  // maar springt de waarde in steeds grotere sprongen.
  const stepped = !!steps && steps.length > 0;
  const idx = stepped ? Math.max(0, steps!.indexOf(value)) : value;
  return (
    <div className="px-4 py-0.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-[26px] flex justify-center">
            <Icon name={icon} className="text-[26px] text-on-surface-variant" />
          </span>
          {title && (
            <span className="font-headline-sm text-[18px] uppercase truncate">
              {title}
            </span>
          )}
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
      {/* Slider springt even ver in als het icoon-slot (26px) + tussenruimte
          (gap-2 = 8px), zodat het startbolletje op één lijn staat met MIN. TEMP. */}
      <div className="pl-[34px]">
        <input
          type="range"
          min={stepped ? 0 : min}
          max={stepped ? steps!.length - 1 : max}
          step={stepped ? 1 : step}
          value={idx}
          onChange={(e) =>
            onChange(stepped ? steps![Number(e.target.value)] : Number(e.target.value))
          }
          className="mt-0.5 w-full"
        />
      </div>
    </div>
  );
}

/** Temperatuur min + max naast elkaar op één rij, met een (i)-uitleg per kant.
 *  Er is maar één uitlegtekst tegelijk open; die verschijnt onder de twee. */
function TempPair({
  minTemp,
  setMinTemp,
  maxTemp,
  setMaxTemp,
}: {
  minTemp: number;
  setMinTemp: (v: number) => void;
  maxTemp: number;
  setMaxTemp: (v: number) => void;
}) {
  const [info, setInfo] = useState<null | "min" | "max">(null);
  const toggle = (k: "min" | "max") =>
    setInfo((cur) => (cur === k ? null : k));
  return (
    <div className="px-4 py-0.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-[26px] flex justify-center">
          <Icon
            name="device_thermostat"
            className="text-[26px] text-on-surface-variant"
          />
        </span>
        <div className="flex flex-1 gap-4 min-w-0">
          <TempCol
            label="Min. temp"
            display={`${minTemp}°`}
            value={minTemp}
            onChange={setMinTemp}
            infoOpen={info === "min"}
            onInfo={() => toggle("min")}
          />
          <TempCol
            label="Max. temp"
            display={maxTemp >= 40 ? "40°+" : `${maxTemp}°`}
            value={maxTemp}
            onChange={setMaxTemp}
            infoOpen={info === "max"}
            onInfo={() => toggle("max")}
          />
        </div>
      </div>
      {info === "min" && (
        <p className="text-[14px] leading-snug text-on-surface-variant mt-1">
          De laagste maximumtemperatuur van de dag. Plaatsen waar het overdag
          kouder blijft dan dit, vervagen.
        </p>
      )}
      {info === "max" && (
        <p className="text-[14px] leading-snug text-on-surface-variant mt-1">
          De hoogste maximumtemperatuur van de dag. Plaatsen waar het overdag
          warmer wordt dan dit, vervagen.
        </p>
      )}
    </div>
  );
}

/** Eén kolom van het temperatuur-paar: label + (i) + waarde, met de slider. */
function TempCol({
  label,
  display,
  value,
  onChange,
  infoOpen,
  onInfo,
}: {
  label: string;
  display: string;
  value: number;
  onChange: (v: number) => void;
  infoOpen: boolean;
  onInfo: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5 min-w-0">
          <span className="font-headline-sm text-[15px] uppercase truncate">
            {label}
          </span>
          <button
            type="button"
            onClick={onInfo}
            aria-label="Uitleg"
            className={`shrink-0 active-press ${
              infoOpen ? "text-primary" : "text-outline hover:text-primary"
            }`}
          >
            <Icon name="info" filled={infoOpen} className="text-[17px]" />
          </button>
        </div>
        <span className="font-headline-sm text-[18px] text-primary shrink-0">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={40}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full"
      />
    </div>
  );
}
