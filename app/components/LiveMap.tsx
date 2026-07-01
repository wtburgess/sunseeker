"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
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
  fetchCurrent,
  fetchCurrents,
  type CurrentWeather,
  type WeatherCondition,
} from "../lib/weather";
import { type City } from "../lib/cities";
import { distanceKm } from "../lib/geo";
import { weatherGlyphSvg } from "../lib/weatherGlyphs";

type Coords = { lat: number; lon: number };
type NearbyPlace = { city: City; cur: CurrentWeather };

/**
 * Zoekgebied als rechthoek in smartphone-verhouding (portret): meer noord-zuid
 * dan oost-west, zodat de kaart het scherm mooi vult zonder lege hoeken.
 */
const HALF_NS_KM = 110; // halve hoogte (noord-zuid)
const HALF_EW_KM = 65; // halve breedte (oost-west)
/** Max. aantal plaatsen tegelijk op de kaart (overzicht houden op een telefoon). */
const MAX_NEARBY = 26;
/** Minimale afstand (px) tussen twee getoonde iconen, om overlap te vermijden. */
const MIN_PX = 40;

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
  if (z >= 8) return 15_000;
  if (z >= 7) return 30_000;
  if (z >= 6) return 80_000;
  return 250_000;
}

/**
 * Kleur van een plaats-icoon naar weerkwaliteit: goud = zonnig/goed weer,
 * bruin = bewolkt/mist, koel grijsgroen = regen/sneeuw/onweer. Zo zie je in één
 * oogopslag waar het beter weer is — ook zonder achtergrond achter het icoon.
 */
function wxIconColor(code: number): string {
  if (code <= 1) return "#d98000"; // zon
  if (code <= 48) return "#6b5b54"; // bewolkt/mist
  return "#44524a"; // nat/winters
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
function currentIcon(cond: WeatherCondition, temp: number) {
  const iconHtml =
    weatherGlyphSvg(cond.icon, 22, ACCENT) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:20px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:${ACCENT}">${cond.icon}</span>`;
  return L.divIcon({
    className: "",
    html:
      // Enkel een accent-ring rond het icoon; geen achtergrond, zodat de
      // onderliggende stad zichtbaar blijft. Icoon + temperatuur zonder schaduw.
      `<div style="width:46px;height:46px;border-radius:50%;display:flex;` +
      `flex-direction:column;align-items:center;justify-content:center;gap:0px;` +
      `border:3px solid ${ACCENT}">` +
      iconHtml +
      `<span style="${TEMP_CENTER}font-size:12px;color:${ACCENT}">${Math.round(temp)}°</span></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}

/** Marker voor een plaats: enkel weericoon + temperatuur, gekleurd naar kwaliteit. */
function nearbyIcon(cur: CurrentWeather) {
  const cond = conditionFromCurrent(cur);
  const color = wxIconColor(cur.code);
  const iconHtml =
    weatherGlyphSvg(cond.icon, 26, color) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:24px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:${color}">${cond.icon}</span>`;
  return L.divIcon({
    className: "",
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;gap:0px">` +
      iconHtml +
      `<span style="${TEMP_CENTER}font-size:13px;color:${color}">${Math.round(cur.temp)}°</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
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
  const cache = useRef<Map<string, CurrentWeather>>(new Map());
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
      const thinned = thinByPixels(cities, map, MIN_PX, MAX_NEARBY);

      const missing = thinned.filter((c) => !cache.current.has(c.id));
      if (missing.length > 0) {
        const currents = await fetchCurrents(missing);
        missing.forEach((c, i) => cache.current.set(c.id, currents[i]));
      }
      if (id !== reqId.current) return; // ondertussen opnieuw geladen
      onLoaded(thinned.map((c) => ({ city: c, cur: cache.current.get(c.id)! })));
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
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);

  // Actueel weer op de eigen locatie ophalen.
  useEffect(() => {
    let active = true;
    setCur(null);
    fetchCurrent(center)
      .then((c) => active && setCur(c))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [center]);

  const cond = cur ? conditionFromCurrent(cur) : null;

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
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
        {nearby
          .filter(({ city }) => distanceKm(center, city) > 2)
          .map(({ city, cur: c }) => (
            <Marker
              key={city.id}
              position={[city.lat, city.lon]}
              icon={nearbyIcon(c)}
              eventHandlers={{
                click: () =>
                  onSelect({
                    name: city.name,
                    lat: city.lat,
                    lon: city.lon,
                  }),
              }}
            />
          ))}

        {/* Eigen locatie bovenop, altijd zichtbaar. */}
        {cond && cur && (
          <Marker
            position={[center.lat, center.lon]}
            icon={currentIcon(cond, cur.temp)}
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

      {loading && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
          <Icon name="progress_activity" className="text-base animate-spin" />
          Weer laden…
        </div>
      )}
    </div>
  );
}
