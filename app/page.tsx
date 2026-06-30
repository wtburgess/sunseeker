"use client";

import dynamic from "next/dynamic";
import { TopAppBar } from "./components/TopAppBar";

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
  return (
    <div className="flex flex-col h-dvh">
      <TopAppBar />
      <div className="relative flex-grow min-h-0">
        <LiveMap />
      </div>
    </div>
  );
}
