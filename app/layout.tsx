import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUNSEEKER | Vind je goede weer",
  description:
    "Plan je reis op basis van het weer dat jij zoekt. Sunseeker scoort bestemmingen op de match met jouw ideale weer.",
};

// Mobiel-eerst: full-screen app-gevoel, notch/safe-area-ondersteuning en
// geen per ongeluk inzoomen op de pagina (de kaart regelt zelf het zoomen).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fff9ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="h-full antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;600;700&family=Fira+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
