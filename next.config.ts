import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forceer deze map als workspace-root (er staat een stray lockfile in ~).
  turbopack: {
    root: __dirname,
  },
  // Verberg de Next.js dev-indicator (het "N"-knopje linksonder) — dat overlapt
  // anders met de zwevende regenvoorspelling tijdens het testen. Alleen dev.
  devIndicators: false,
};

export default nextConfig;
