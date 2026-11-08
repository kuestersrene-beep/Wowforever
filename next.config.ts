import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt ein minimales, selbst-lauffähiges Server-Bundle.
  // Das brauchen wir für das schlanke Docker-Image (siehe Dockerfile).
  output: "standalone",
  experimental: {
    // Gold-Radar-Uploads: die Tool-Datei ist ~2 MB, eine AuctionDB.lua mit
    // Rohscans (einzelne Auktionen) 10-25 MB (SCAN_FILE_MAX_BYTES 40 MB).
    // Server Actions erlauben standardmäßig nur 1 MB.
    serverActions: { bodySizeLimit: "45mb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
};

export default nextConfig;
