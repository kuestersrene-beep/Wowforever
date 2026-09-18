import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt ein minimales, selbst-lauffähiges Server-Bundle.
  // Das brauchen wir für das schlanke Docker-Image (siehe Dockerfile).
  output: "standalone",
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
