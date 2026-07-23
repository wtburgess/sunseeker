"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { TopAppBar } from "./components/TopAppBar";
import { LocationBar } from "./components/LocationBar";
import { CityDetail } from "./components/CityDetail";
import { WeatherStory } from "./components/WeatherStory";
import { Legend } from "./components/Legend";
import {
  geocode,
  reverseGeocode,
  fetchIpLocation,
  type GeocodeResult,
} from "./lib/geo";
import {
  loadFavorites,
  toggleFavorite,
  removeFavorite,
  isFavorite,
  type Favorite,
} from "./lib/favorites";

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
  // Naam van de ingeladen plaats (los van de bewerkbare zoektekst) — voor de
  // kaart-titel en om de huidige plaats als favoriet te kunnen bewaren.
  const [placeName, setPlaceName] = useState("");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Aangeklikte plaats → dag-detailoverzicht (over de zoekbalk + kaart).
  const [selected, setSelected] = useState<{
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  // Plaats waarvoor het weerpraatje open staat (bovenbalk of detailscherm).
  const [storyPlace, setStoryPlace] = useState<{
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  // Werkelijke locatie van het toestel (GPS of IP-benadering) — apart van de
  // gezochte/gecentreerde plaats, want de afstand in het dagdetail moet altijd
  // vanaf het toestel gerekend worden, niet vanaf wat in het zoekveld staat.
  const [deviceLoc, setDeviceLoc] = useState<{
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  // Chrome-op-iOS (CriOS) heeft de deelknop onder het drie-puntjes-menu;
  // Safari heeft het deel-icoon los in de balk. De instructie verschilt dus.
  const [iosIsChrome, setIosIsChrome] = useState(false);

  // Terugval als de toestellocatie (GPS) niet beschikbaar is: benaderende
  // locatie via het IP-adres (geen toestemming nodig). Lukt ook dat niet, dan
  // Brussel als laatste redmiddel.
  const fallbackToIp = useCallback(async () => {
    const ip = await fetchIpLocation();
    if (ip) {
      setCoords({ lat: ip.lat, lon: ip.lon });
      setQuery(ip.name);
      setPlaceName(ip.name);
      setDeviceLoc({ name: ip.name, lat: ip.lat, lon: ip.lon });
      setNotice("Locatie bij benadering - zet je GPS-locatie aan voor meer precisie");
    } else {
      setCoords((c) => c ?? FALLBACK);
      setQuery((q) => q || "Brussel");
      setPlaceName((p) => p || "Brussel");
      setDeviceLoc((d) => d ?? { name: "Brussel", lat: FALLBACK.lat, lon: FALLBACK.lon });
      setNotice("Geen locatie beschikbaar — typ een plaats of gebruik Brussel");
    }
    setLocating(false);
  }, []);

  // Locatie van pc/smartphone inlezen: kaart centreren én de plaatsnaam in het
  // invulveld tonen (net alsof je hem had ingetypt en op Enter gedrukt).
  const useDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocating(true);
      void fallbackToIp();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCoords(here);
        setDeviceLoc({ name: "Mijn locatie", lat: here.lat, lon: here.lon });
        setNotice(null);
        setLocating(false);
        const name = await reverseGeocode(here.lat, here.lon).catch(() => null);
        if (name) {
          setQuery(name);
          setPlaceName(name);
          setDeviceLoc({ name, lat: here.lat, lon: here.lon });
        }
      },
      () => {
        // GPS geweigerd of niet beschikbaar → benaderen via IP.
        void fallbackToIp();
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [fallbackToIp]);

  // Een aangetikt voorstel: coördinaten zijn al bekend, dus meteen de kaart
  // verplaatsen zonder een tweede zoekopdracht.
  const handleSelect = useCallback((place: GeocodeResult) => {
    setCoords({ lat: place.lat, lon: place.lon });
    setQuery(place.name);
    setPlaceName(place.name);
    setNotice(null);
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
      setPlaceName(place.name);
      setNotice(null);
    } catch {
      setNotice("Zoeken mislukte, probeer opnieuw");
    }
  }, []);

  // Springt naar een bewaarde favoriet (coördinaten al bekend).
  const handleSelectFavorite = useCallback((f: Favorite) => {
    setCoords({ lat: f.lat, lon: f.lon });
    setQuery(f.name);
    setPlaceName(f.name);
    setNotice(null);
  }, []);

  // De huidige, ingeladen plaats (indien bekend) — bewaarbaar als favoriet.
  const currentPlace =
    coords && placeName
      ? { name: placeName, lat: coords.lat, lon: coords.lon }
      : null;

  const toggleCurrentFavorite = useCallback(() => {
    if (!currentPlace) return;
    setFavorites((list) => toggleFavorite(list, currentPlace));
  }, [currentPlace]);

  const handleRemoveFavorite = useCallback((f: Favorite) => {
    setFavorites((list) => removeFavorite(list, f));
  }, []);

  // Bewaart/verwijdert een concrete plaats (bv. vanuit het detailscherm).
  const toggleFavoritePlace = useCallback((f: Favorite) => {
    setFavorites((list) => toggleFavorite(list, f));
  }, []);

  // Bij het openen: favorieten inladen én meteen de toestellocatie proberen.
  useEffect(() => {
    setFavorites(loadFavorites());
    useDeviceLocation();
  }, [useDeviceLocation]);

  // Android: beforeinstallprompt event afvangen voor install-prompt.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // iOS: hint tonen zolang app niet op home screen staat.
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // App staat op home screen als standalone mode actief is (navigator.standalone)
    // of als display-mode: standalone (moderne browsers)
    const isStandalone =
      (navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    // Hint tonen als iOS EN niet standalone
    if (isIOS && !isStandalone) {
      // CriOS = Chrome op iOS, FxiOS = Firefox, EdgiOS = Edge — allemaal met
      // de deelknop onder een drie-puntjes-menu i.p.v. los in de balk.
      setIosIsChrome(/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
      setShowIOSHint(true);
    }
  }, []);

  const handleInstallAndroid = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        setInstallPrompt(null);
      }
    }
  };

  return (
    <div className="h-dvh w-full flex items-center justify-center md:p-6">
      {/* Smartphone-kader: op desktop een beperkt telefoon-venster i.p.v.
          schermvullend; op mobiel gewoon het volledige scherm. */}
      <div className="relative flex flex-col w-full h-full bg-surface overflow-hidden md:w-[400px] md:h-[min(820px,calc(100dvh_-_3rem))] md:rounded-[2rem] md:border-2 md:border-outline-variant md:shadow-2xl">
        <TopAppBar
          onInfo={() => setShowLegend(true)}
          // Weerpraatje volgt de context: in een detailscherm dat van de
          // bekeken plaats, anders dat van de plaats uit de zoekbalk.
          onStory={
            selected || currentPlace
              ? () => setStoryPlace(selected ?? currentPlace)
              : undefined
          }
        />
        {/* Alles onder de titel; het detailoverzicht overdekt straks ook de
            zoekbalk (start net onder de hoofdtitel). */}
        <div className="relative flex-grow min-h-0 flex flex-col">
          <LocationBar
            value={query}
            onChange={setQuery}
            onLocate={useDeviceLocation}
            locating={locating}
            onSubmitPlace={handlePlace}
            onSelectPlace={handleSelect}
            notice={notice}
            favorites={favorites}
            canFavorite={!!currentPlace}
            isCurrentFavorite={!!currentPlace && isFavorite(favorites, currentPlace)}
            onToggleFavorite={toggleCurrentFavorite}
            onSelectFavorite={handleSelectFavorite}
            onRemoveFavorite={handleRemoveFavorite}
          />
          <div className="relative flex-grow min-h-0">
            {coords ? (
              <LiveMap
                center={coords}
                label={placeName || query}
                favorites={favorites}
                onSelect={setSelected}
              />
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
            <CityDetail
              place={selected}
              reference={deviceLoc}
              isFavorite={isFavorite(favorites, selected)}
              onToggleFavorite={() => toggleFavoritePlace(selected)}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
        {storyPlace && (
          <WeatherStory
            place={storyPlace}
            onClose={() => setStoryPlace(null)}
          />
        )}
        {showLegend && <Legend onClose={() => setShowLegend(false)} />}

        {/* Android: install-prompt */}
        {installPrompt && (
          <div className="fixed inset-0 z-[2000] flex items-end">
            <div className="w-full bg-surface-container-high border-t border-outline-variant p-4 shadow-2xl rounded-t-3xl">
              <div className="flex items-start gap-3 mb-4">
                <span className="material-symbols-outlined text-primary text-2xl flex-shrink-0 mt-1">
                  home_screen_search
                </span>
                <div className="flex-1">
                  <p className="font-label-lg text-label-lg text-on-surface font-medium">
                    Voeg Sunseeker toe aan je home screen
                  </p>
                  <p className="text-on-surface-variant text-label-md mt-1">
                    Snelle toegang zonder app store
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setInstallPrompt(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-outline text-on-surface font-label-lg hover:bg-surface-variant active:bg-surface-variant transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={handleInstallAndroid}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-lg hover:bg-primary/90 active:bg-primary/80 transition-colors"
                >
                  Installeren
                </button>
              </div>
            </div>
          </div>
        )}

        {/* iOS: hint voor handmatig toevoegen — native iOS-alert stijl */}
        {showIOSHint && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center px-8 bg-black/40">
            <div className="w-[270px] max-w-full overflow-hidden rounded-[14px] bg-[#f7f7f7]/95 backdrop-blur-xl shadow-2xl text-center">
              <div className="px-4 pt-5 pb-4">
                <h2 className="text-[17px] font-semibold leading-tight text-black">
                  Maak een app van SUNSEEKER
                </h2>
                <p className="mt-2 text-[13px] leading-snug text-black/80">
                  {iosIsChrome ? (
                    <>Druk nu op de drie puntjes, kies “Deel”</>
                  ) : (
                    <>Druk nu onderaan op het deel-icoon (drie puntjes)</>
                  )}
                  , scroll naar beneden en selecteer:{" "}
                  <strong>Zet op beginscherm</strong> en voeg toe.
                </p>
              </div>
              <button
                onClick={() => setShowIOSHint(false)}
                className="block w-full border-t border-black/10 py-2.5 text-[17px] font-semibold text-[#007aff] active:bg-black/5"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
