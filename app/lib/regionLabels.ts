export type RegionLabel = { name: string; lat: number; lon: number };

/**
 * Gecureerde set bekende Europese regio's mét een Nederlandse naam (exoniem of
 * lokale provincie), met een benaderend zwaartepunt. Geen volledige admin1-dataset:
 * bewust een handmatige selectie zodat de namen écht Nederlands zijn en de kaart
 * rustig blijft. Getekend op regionaal zoomniveau (zie LiveMap).
 */
export const REGION_LABELS: RegionLabel[] = [
  // België
  { name: "West-Vlaanderen", lat: 51.05, lon: 3.1 },
  { name: "Oost-Vlaanderen", lat: 51.0, lon: 3.75 },
  { name: "Antwerpen", lat: 51.2, lon: 4.8 },
  { name: "Vlaams-Brabant", lat: 50.9, lon: 4.6 },
  { name: "Limburg", lat: 50.95, lon: 5.4 },
  { name: "Waals-Brabant", lat: 50.68, lon: 4.55 },
  { name: "Henegouwen", lat: 50.45, lon: 4.0 },
  { name: "Namen", lat: 50.25, lon: 4.9 },
  { name: "Luik", lat: 50.55, lon: 5.75 },
  { name: "Luxemburg", lat: 49.85, lon: 5.45 },
  // Nederland
  { name: "Noord-Holland", lat: 52.6, lon: 4.85 },
  { name: "Zuid-Holland", lat: 52.0, lon: 4.5 },
  { name: "Utrecht", lat: 52.08, lon: 5.15 },
  { name: "Gelderland", lat: 52.05, lon: 5.9 },
  { name: "Overijssel", lat: 52.45, lon: 6.4 },
  { name: "Drenthe", lat: 52.9, lon: 6.6 },
  { name: "Groningen", lat: 53.25, lon: 6.75 },
  { name: "Friesland", lat: 53.1, lon: 5.8 },
  { name: "Flevoland", lat: 52.5, lon: 5.55 },
  { name: "Noord-Brabant", lat: 51.55, lon: 5.1 },
  { name: "Limburg", lat: 51.2, lon: 5.95 },
  { name: "Zeeland", lat: 51.45, lon: 3.85 },
  // Frankrijk
  { name: "Bretagne", lat: 48.2, lon: -3.0 },
  { name: "Normandië", lat: 49.0, lon: 0.2 },
  { name: "Picardië", lat: 49.7, lon: 2.8 },
  { name: "Elzas", lat: 48.5, lon: 7.5 },
  { name: "Lotharingen", lat: 48.9, lon: 6.2 },
  { name: "Bourgondië", lat: 47.2, lon: 4.5 },
  { name: "Champagne", lat: 48.8, lon: 4.4 },
  { name: "Île-de-France", lat: 48.8, lon: 2.5 },
  { name: "Provence", lat: 43.9, lon: 6.0 },
  { name: "Aquitanië", lat: 44.7, lon: -0.5 },
  { name: "Occitanië", lat: 43.7, lon: 2.3 },
  { name: "Auvergne", lat: 45.4, lon: 3.1 },
  { name: "Gascogne", lat: 43.7, lon: 0.3 },
  { name: "Corsica", lat: 42.1, lon: 9.1 },
  // Duitsland
  { name: "Beieren", lat: 48.9, lon: 11.5 },
  { name: "Baden-Württemberg", lat: 48.6, lon: 9.0 },
  { name: "Noordrijn-Westfalen", lat: 51.4, lon: 7.5 },
  { name: "Nedersaksen", lat: 52.8, lon: 9.3 },
  { name: "Hessen", lat: 50.6, lon: 9.0 },
  { name: "Saksen", lat: 51.0, lon: 13.4 },
  { name: "Thüringen", lat: 50.9, lon: 11.0 },
  { name: "Rijnland-Palts", lat: 49.9, lon: 7.4 },
  { name: "Sleeswijk-Holstein", lat: 54.2, lon: 9.7 },
  { name: "Brandenburg", lat: 52.4, lon: 13.0 },
  { name: "Saksen-Anhalt", lat: 51.9, lon: 11.7 },
  { name: "Mecklenburg-Voor-Pommeren", lat: 53.6, lon: 12.7 },
  { name: "Saarland", lat: 49.4, lon: 6.9 },
  // Italië
  { name: "Lombardije", lat: 45.6, lon: 9.7 },
  { name: "Piëmont", lat: 45.0, lon: 7.9 },
  { name: "Veneto", lat: 45.5, lon: 11.9 },
  { name: "Ligurië", lat: 44.3, lon: 8.7 },
  { name: "Emilia-Romagna", lat: 44.6, lon: 11.0 },
  { name: "Toscane", lat: 43.4, lon: 11.1 },
  { name: "Umbrië", lat: 42.9, lon: 12.5 },
  { name: "Lazio", lat: 41.9, lon: 12.7 },
  { name: "Campanië", lat: 40.85, lon: 15.0 },
  { name: "Apulië", lat: 41.0, lon: 16.5 },
  { name: "Calabrië", lat: 39.0, lon: 16.5 },
  { name: "Sicilië", lat: 37.6, lon: 14.0 },
  { name: "Sardinië", lat: 40.1, lon: 9.0 },
  { name: "Trentino-Zuid-Tirol", lat: 46.4, lon: 11.4 },
  // Spanje
  { name: "Galicië", lat: 42.8, lon: -8.0 },
  { name: "Asturië", lat: 43.3, lon: -6.0 },
  { name: "Cantabrië", lat: 43.2, lon: -4.0 },
  { name: "Baskenland", lat: 43.0, lon: -2.6 },
  { name: "Navarra", lat: 42.7, lon: -1.6 },
  { name: "Aragón", lat: 41.6, lon: -0.9 },
  { name: "Catalonië", lat: 41.8, lon: 1.7 },
  { name: "Castilië en León", lat: 41.7, lon: -4.8 },
  { name: "Castilië-La Mancha", lat: 39.5, lon: -3.0 },
  { name: "Valencia", lat: 39.5, lon: -0.8 },
  { name: "Extremadura", lat: 39.2, lon: -6.2 },
  { name: "Andalusië", lat: 37.5, lon: -4.7 },
  { name: "Murcia", lat: 38.0, lon: -1.5 },
  // Portugal
  { name: "Alentejo", lat: 38.5, lon: -8.0 },
  { name: "Algarve", lat: 37.2, lon: -8.2 },
  // Verenigd Koninkrijk & Ierland
  { name: "Schotland", lat: 56.8, lon: -4.2 },
  { name: "Engeland", lat: 52.5, lon: -1.5 },
  { name: "Wales", lat: 52.3, lon: -3.8 },
  { name: "Noord-Ierland", lat: 54.7, lon: -6.7 },
  { name: "Cornwall", lat: 50.4, lon: -4.8 },
  { name: "Yorkshire", lat: 54.0, lon: -1.5 },
  // Oostenrijk
  { name: "Tirol", lat: 47.2, lon: 11.3 },
  { name: "Steiermark", lat: 47.2, lon: 15.0 },
  { name: "Karinthië", lat: 46.7, lon: 14.0 },
  // Tsjechië
  { name: "Bohemen", lat: 49.8, lon: 14.5 },
  { name: "Moravië", lat: 49.4, lon: 17.0 },
  // Polen
  { name: "Silezië", lat: 50.3, lon: 18.7 },
  { name: "Klein-Polen", lat: 50.0, lon: 20.3 },
  { name: "Groot-Polen", lat: 52.3, lon: 17.3 },
  { name: "Pommeren", lat: 54.0, lon: 17.5 },
  { name: "Mazurië", lat: 53.8, lon: 21.5 },
  // Kroatië
  { name: "Istrië", lat: 45.2, lon: 13.9 },
  { name: "Dalmatië", lat: 43.5, lon: 16.5 },
  // Griekenland
  { name: "Peloponnesos", lat: 37.3, lon: 22.3 },
  { name: "Thessalië", lat: 39.6, lon: 22.3 },
  { name: "Kreta", lat: 35.2, lon: 24.8 },
  // Roemenië
  { name: "Transsylvanië", lat: 46.7, lon: 24.0 },
  // Scandinavië & Denemarken
  { name: "Jutland", lat: 56.3, lon: 9.3 },
  { name: "Skåne", lat: 55.9, lon: 13.6 },
  { name: "Lapland", lat: 67.5, lon: 22.0 },
];
