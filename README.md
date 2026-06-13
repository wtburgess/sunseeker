# Sunseeker 🌞

Plan je reis op basis van het weer dat jíj zoekt. Sunseeker scoort honderden
Europese bestemmingen op de match met jouw ideale weer en toont ze in een lijst
én op een interactieve kaart met tijdslider.

> "Modern Expedition" design — een mix van vintage national-park posters en
> high-end outdoor gear.

## Hoe het werkt

1. **Input** — vertrekpunt, reisduur (7/14 dagen), minimumtemperatuur, maximale
   afstand en je weersvoorkeuren (zonnig / droog).
2. **Geocoding** — je vertrekpunt wordt omgezet naar coördinaten (Open-Meteo).
3. **Filteren** — uit ~750 Europese steden (>100k inwoners) houden we de
   grootste binnen je afstandsbereik over (Haversine).
4. **Forecast & score** — per bestemming halen we de dagelijkse voorspelling op
   over je reisvenster en berekenen we per dag een score (0–10) op
   temperatuur, zon (bewolking) en droogte. De eindscore is het gemiddelde van
   de **beste aaneengesloten dagen**.
5. **Resultaat** — gesorteerde lijst met dag-detail per stad, plus een
   Leaflet-kaart waar je met een tijdslider dag per dag door het weer schuift.

## Tech

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4 — design tokens uit het Sunseeker design system
- [Leaflet](https://leafletjs.com) / react-leaflet voor de kaart

## Databronnen

- **Weer & geocoding**: [Open-Meteo](https://open-meteo.com) — gratis, geen API-key.
- **Steden**: [GeoNames](https://www.geonames.org) `cities15000` (CC BY 4.0),
  gefilterd op Europese steden >100k inwoners.

## Lokaal draaien

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build && npm start
```
