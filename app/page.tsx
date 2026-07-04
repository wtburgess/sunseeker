"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { TopAppBar } from "./components/TopAppBar";
import { LocationBar } from "./components/LocationBar";
import { CityDetail } from "./components/CityDetail";
import { Legend } from "./components/Legend";
import { geocode, reverseGeocode } from "./lib/geo";

export type Coords = { lat: number; lon: number };

// Terugvallocatie als het toestel geen geolocatie geeft (Brussel).
const FALLBACK: Coords = { lat: 50.8503, lon: 4.3517 };

// Leaflet heeft `window` nodig → enkel client-side renderen.
const LiveMap = dynamic(() => import("./components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-outline font-label-lg text-label-lg uppercase tracking-widest">
      Kaart laden…
    </div>
  ),
});

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Aangeklikte plaats → dag-detailoverzicht (over de zoekbalk + kaart).
  const [selected, setSelected] = useState<{
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // Locatie van pc/smartphone inlezen: kaart centreren én de plaatsnaam in het
  // invulveld tonen (net alsof je hem had ingetypt en op Enter gedrukt).
  const useDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setCoords((c) => c ?? FALLBACK);
      setQuery("Brussel");
      setNotice("Geen toestellocatie beschikbaar — Brussel getoond");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCoords(here);
        setNotice(null);
        setLocating(false);
        const name = await reverseGeocode(here.lat, here.lon).catch(() => null);
        if (name) setQuery(name);
      },
      () => {
        setCoords((c) => c ?? FALLBACK);
        setQuery((q) => q || "Brussel");
        setNotice("Geen toegang tot je locatie — typ een plaats of gebruik Brussel");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // Getypte plaats opzoeken en de kaart daarheen verplaatsen.
  const handlePlace = useCallback(async (q: string) => {
    try {
      const place = await geocode(q);
      if (!place) {
        setNotice(`Geen plaats gevonden voor “${q}”`);
        return;
      }
      setCoords({ lat: place.lat, lon: place.lon });
      setQuery(place.name);
      setNotice(null);
    } catch {
      setNotice("Zoeken mislukte, probeer opnieuw");
    }
  }, []);

  // Bij het openen: meteen de toestellocatie proberen.
  useEffect(() => {
    useDeviceLocation();
  }, [useDeviceLocation]);

  return (
    <div className="h-dvh w-full flex items-center justify-center md:p-6">
      {/* Smartphone-kader: op desktop een beperkt telefoon-venster i.p.v.
          schermvullend; op mobiel gewoon het volledige scherm. */}
      <div className="relative flex flex-col w-full h-full bg-surface overflow-hidden md:w-[400px] md:h-[min(820px,calc(100dvh_-_3rem))] md:rounded-[2rem] md:border-2 md:border-outline-variant md:shadow-2xl">
        <TopAppBar onInfo={() => setShowLegend(true)} />
        {/* Alles onder de titel; het detailoverzicht overdekt straks ook de
            zoekbalk (start net onder de hoofdtitel). */}
        <div className="relative flex-grow min-h-0 flex flex-col">
          <LocationBar
            value={query}
            onChange={setQuery}
            onLocate={useDeviceLocation}
            locating={locating}
            onSubmitPlace={handlePlace}
            notice={notice}
          />
          <div className="relative flex-grow min-h-0">
            {coords ? (
              <LiveMap center={coords} label={query} onSelect={setSelected} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px] text-primary animate-pulse">
                  my_location
                </span>
                <p className="font-label-lg text-label-lg uppercase tracking-widest">
                  Je locatie bepalen…
                </p>
              </div>
            )}
          </div>
          {selected && (
            <CityDetail place={selected} onClose={() => setSelected(null)} />
          )}
        </div>
        {showLegend && <Legend onClose={() => setShowLegend(false)} />}
      </div>
    </div>
  );
}
