import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN } from "@/lib/constants";

export interface SiteSettings {
  logoUrl: string | null;
  // Eigenes Logo nur für den Countdown, unabhängig vom Haupt-Logo.
  timerLogoUrl: string | null;
  // Prozent der jeweiligen Standardgröße, 100 = normal.
  logoScale: number;
}

const DEFAULT_SETTINGS: SiteSettings = {
  logoUrl: null,
  timerLogoUrl: null,
  logoScale: LOGO_SCALE_DEFAULT,
};

// Liest die Seiten-Einstellungen (siehe site_settings in
// supabase/schema.sql). cache() sorgt dafür, dass pro Seitenaufruf nur
// einmal abgefragt wird, egal wie oft das Logo vorkommt. Fehler (z. B.
// wenn das Schema noch nicht eingespielt ist) führen zu den
// Standardwerten - dann wird einfach das Standard-Emblem angezeigt.
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle<{
        logo_url: string | null;
        timer_logo_url?: string | null;
        logo_scale?: number | null;
      }>();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      logoUrl: data.logo_url || null,
      timerLogoUrl: data.timer_logo_url || null,
      logoScale: clampLogoScale(data.logo_scale ?? LOGO_SCALE_DEFAULT),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
});

export async function getLogoUrl(): Promise<string | null> {
  return (await getSiteSettings()).logoUrl;
}

export function clampLogoScale(value: number): number {
  if (!Number.isFinite(value)) return LOGO_SCALE_DEFAULT;
  return Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, Math.round(value)));
}

// Nur https-Adressen zulassen: http-Bilder würden auf der per HTTPS
// ausgelieferten Seite vom Browser blockiert.
export function isValidLogoUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:" && url.length <= 1000;
  } catch {
    return false;
  }
}
