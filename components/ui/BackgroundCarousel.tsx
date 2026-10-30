"use client";

import { useEffect, useState } from "react";

// Stimmungsvolle WoW-Forever-Szenenbilder (ohne UI) - bei jedem
// Seitenaufruf wird zufällig eines ausgewählt. Rein clientseitig
// (useEffect statt direkt beim ersten Render), damit Server- und
// Client-Markup beim ersten Render identisch sind (kein
// Hydration-Mismatch) - der Hintergrund "poppt" dadurch minimal nach
// dem Laden auf, das ist hier unproblematisch.
const BACKGROUNDS = [
  "/images/backgrounds/bg-1.jpg",
  "/images/backgrounds/bg-2.jpg",
  "/images/backgrounds/bg-3.jpg",
  "/images/backgrounds/bg-4.jpg",
];

export default function BackgroundCarousel() {
  const [bg, setBg] = useState<string | null>(null);

  useEffect(() => {
    setBg(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);
  }, []);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center opacity-0 transition-opacity duration-1000"
        style={{
          backgroundImage: bg ? `url(${bg})` : undefined,
          opacity: bg ? 1 : 0,
        }}
      />
      {/* Gleiche Verlaufsfarben wie bisher (bg-wow-radial), nur mit
          Transparenz, damit das Szenenbild darunter durchscheint statt
          komplett verdeckt zu werden - Lesbarkeit bleibt durch die
          eigene, dunkle Panel-Hintergrundfarbe der Inhaltsboxen erhalten. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at top, rgba(42,29,20,0.72) 0%, rgba(20,15,11,0.85) 45%, rgba(10,8,7,0.93) 100%)",
        }}
      />
    </>
  );
}
