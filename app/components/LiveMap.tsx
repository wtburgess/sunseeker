"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
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

/** Reikwijdte (straal) rondom de huidige locatie, in meter. */
const RADIUS_M = 100_000;
/** Max. aantal nabije plaatsen op de kaart (overzicht houden op een telefoon). */
const MAX_NEARBY = 16;
/** Minimale afstand (km) tussen twee getoonde plaatsen, om overlap te vermijden. */
const MIN_SEP_KM = 20;

/** Terugvallocatie als het toestel geen geolocatie geeft (Brussel). */
const FALLBACK: Coords = { lat: 50.8503, lon: 4.3517 };

const ACCENT = "#9d3d22";

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

/** Schaduw zodat een achtergrondloos icoon leesbaar blijft op de lichte kaart. */
const ICON_SHADOW = "filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))";
const TEXT_HALO = "text-shadow:0 1px 2px rgba(255,249,238,.95)";

/** Marker op de huidige locatie: enkel weericoon + temperatuur (accentkleur). */
function currentIcon(cond: WeatherCondition, temp: number) {
  const iconHtml =
    weatherGlyphSvg(cond.icon, 26, ACCENT) ??
    `<span style="font-family:'Material Symbols Outlined';font-size:24px;` +
      `font-variation-settings:'FILL' 1;line-height:1;color:${ACCENT}">${cond.icon}</span>`;
  return L.divIcon({
    className: "",
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;gap:0px;${ICON_SHADOW}">` +
      iconHtml +
      `<span style="font-family:'Archivo Narrow',sans-serif;font-weight:700;` +
      `font-size:13px;line-height:1;color:${ACCENT};${TEXT_HALO}">${Math.round(temp)}°</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

/** Marker voor een nabije plaats: enkel weericoon + temperatuur, gekleurd naar kwaliteit. */
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
      `<div style="display:flex;flex-direction:column;align-items:center;gap:0px;${ICON_SHADOW}">` +
      iconHtml +
      `<span style="font-family:'Archivo Narrow',sans-serif;font-weight:700;` +
      `font-size:13px;line-height:1;color:${color};${TEXT_HALO}">${Math.round(cur.temp)}°</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

/**
 * Geografisch uitdunnen: loopt de plaatsen af (op inwonertal, hoog→laag) en
 * houdt er één enkel als die ver genoeg van alle reeds gekozen plaatsen ligt.
 * Zo blijft per cluster de belangrijkste stad over en krijg je een nette
 * spreiding zonder overlappende iconen.
 */
function thinByDistance(cities: City[], minKm: number, max: number): City[] {
  const kept: City[] = [];
  for (const c of cities) {
    if (kept.every((k) => distanceKm(k, c) >= minKm)) {
      kept.push(c);
      if (kept.length >= max) break;
    }
  }
  return kept;
}

/** Haalt de plaatsen binnen de straal op en spreidt ze geografisch uit. */
async function fetchNearbyCities(
  center: Coords,
  radiusKm: number,
): Promise<City[]> {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  const params = new URLSearchParams({
    minLat: String(center.lat - latDelta),
    maxLat: String(center.lat + latDelta),
    minLon: String(center.lon - lonDelta),
    maxLon: String(center.lon + lonDelta),
    minPop: "50000",
    limit: "200",
  });
  const res = await fetch(`/api/cities?${params.toString()}`);
  if (!res.ok) return [];
  const cities: City[] = await res.json();
  const inRange = cities.filter((c) => distanceKm(center, c) <= radiusKm);
  return thinByDistance(inRange, MIN_SEP_KM, MAX_NEARBY);
}

/** Kadert de kaart rond de 100 km-cirkel van het middelpunt. */
function FitToRadius({ center }: { center: Coords }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center.lat, center.lon).toBounds(RADIUS_M * 2);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [center, map]);
  return null;
}

export default function LiveMap() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [cur, setCur] = useState<CurrentWeather | null>(null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  // Locatie van het toestel uitlezen, met terugval naar Brussel.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(FALLBACK);
      setUsedFallback(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        setCoords(FALLBACK);
        setUsedFallback(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // Actueel weer op de eigen locatie ophalen.
  useEffect(() => {
    if (!coords) return;
    let active = true;
    fetchCurrent(coords)
      .then((c) => active && setCur(c))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [coords]);

  // Nabije plaatsen + hun actuele weer ophalen.
  useEffect(() => {
    if (!coords) return;
    let active = true;
    setLoadingNearby(true);
    (async () => {
      const cities = await fetchNearbyCities(coords, RADIUS_M / 1000);
      if (!active || cities.length === 0) return;
      const currents = await fetchCurrents(cities);
      if (!active) return;
      setNearby(cities.map((city, i) => ({ city, cur: currents[i] })));
    })()
      .catch(() => {})
      .finally(() => active && setLoadingNearby(false));
    return () => {
      active = false;
    };
  }, [coords]);

  if (!coords) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
        <Icon
          name="my_location"
          className="text-[40px] text-primary animate-pulse"
        />
        <p className="font-label-lg text-label-lg uppercase tracking-widest">
          Je locatie bepalen…
        </p>
      </div>
    );
  }

  const cond = cur ? conditionFromCurrent(cur) : null;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[coords.lat, coords.lon]}
        zoom={8}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <FitToRadius center={coords} />
        <Circle
          center={[coords.lat, coords.lon]}
          radius={RADIUS_M}
          pathOptions={{
            color: ACCENT,
            weight: 2,
            fillColor: ACCENT,
            fillOpacity: 0.07,
          }}
        />

        {/* Nabije plaatsen met hun actuele weer. */}
        {nearby.map(({ city, cur: c }) => (
          <Marker
            key={city.id}
            position={[city.lat, city.lon]}
            icon={nearbyIcon(c)}
          >
            <Popup>
              <strong>{city.name}</strong>
              <br />
              {conditionFromCurrent(c).label} · {Math.round(c.temp)}°
            </Popup>
          </Marker>
        ))}

        {/* Eigen locatie bovenop, altijd zichtbaar. */}
        {cond && cur && (
          <Marker
            position={[coords.lat, coords.lon]}
            icon={currentIcon(cond, cur.temp)}
            zIndexOffset={1000}
          >
            <Popup>
              <strong>Hier ben je</strong>
              <br />
              {cond.label} · {Math.round(cur.temp)}°
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {loadingNearby && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
          <Icon name="progress_activity" className="text-base animate-spin" />
          Plaatsen in de buurt laden…
        </div>
      )}

      {usedFallback && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 rounded-full bg-surface/95 border border-outline-variant px-3 py-1 stamp-shadow font-label-sm text-label-sm text-on-surface-variant">
          <Icon name="location_off" className="text-base text-primary" />
          Geen toestellocatie — Brussel getoond
        </div>
      )}
    </div>
  );
}
