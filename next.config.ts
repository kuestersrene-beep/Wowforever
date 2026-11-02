import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt ein minimales, selbst-lauffähiges Server-Bundle.
  // Das brauchen wir für das schlanke Docker-Image (siehe Dockerfile).
  output: "standalone",
  experimental: {
    // Gold-Radar-Upload (app/admin/gold-radar): die Tool-Datei ist ~2 MB,
    // Server Actions erlauben standardmäßig nur 1 MB.
    serverActions: { bodySizeLimit: "10mb" },
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
