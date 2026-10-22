"use client";

import { createContext, useContext } from "react";
import { LOGO_SCALE_DEFAULT } from "@/lib/constants";

interface Branding {
  logoUrl: string | null;
  timerLogoUrl: string | null;
  // Prozent der jeweiligen Standardgröße, 100 = normal.
  logoScale: number;
}

// Stellt Logo-URL und -Größe allen Komponenten bereit, auch Client
// Components wie dem Countdown-Banner. Wird einmal im Root-Layout aus
// site_settings geladen.
const BrandingContext = createContext<Branding>({
  logoUrl: null,
  timerLogoUrl: null,
  logoScale: LOGO_SCALE_DEFAULT,
});

export function BrandingProvider({
  logoUrl,
  timerLogoUrl,
  logoScale,
  children,
}: Branding & { children: React.ReactNode }) {
  return (
    <BrandingContext.Provider value={{ logoUrl, timerLogoUrl, logoScale }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
