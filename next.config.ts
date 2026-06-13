import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forceer deze map als workspace-root (er staat een stray lockfile in ~).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
