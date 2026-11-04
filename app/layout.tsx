import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { BrandingProvider } from "@/lib/branding";
import { getSiteSettings } from "@/lib/siteSettings";
import SiteHeader from "@/components/SiteHeader";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { GUILD_APPLE_ICON, GUILD_ICON, GUILD_NAME } from "@/lib/guild";

// Lokal statt next/font/google: next/font/google lädt die Dateien zur
// Build-Zeit von Google herunter - schlägt der Docker-Build-Container
// mal ohne (oder mit gestörtem) Internetzugriff fehl, bricht der ganze
// Build mit einem kryptischen Fehler in next/font ab. Mit lokal
// mitgelieferten Dateien (gleiche Schriften/Gewichte wie vorher, aus
// Google Fonts heruntergeladen) ist der Build davon unabhängig.
const cinzel = localFont({
  src: [
    { path: "./fonts/cinzel-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/cinzel-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/cinzel-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});

const inter = localFont({
  src: [{ path: "./fonts/inter-variable.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-body",
  display: "swap",
});

// Das Gildenwappen als Browser-Tab-Icon (das im Admin-Bereich gesetzte
// Countdown-Logo ist das WoW-Forever-Logo und passt dafür nicht mehr).
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `${GUILD_NAME} · WoW Forever`,
    description: `${GUILD_NAME} – Horde-Gilde in World of Warcraft Forever (PvP-EU)`,
    icons: { icon: [{ url: GUILD_ICON, type: "image/png" }, { url: "/favicon.ico", sizes: "48x48" }], apple: GUILD_APPLE_ICON },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = await loadDictionary(locale);
  const { logoUrl, timerLogoUrl, logoScale } = await getSiteSettings();

  return (
    <html lang={locale} className={`${cinzel.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col overflow-x-clip font-sans">
        <LocaleProvider locale={locale} dict={dict}>
          <BrandingProvider
            logoUrl={logoUrl}
            timerLogoUrl={timerLogoUrl}
            logoScale={logoScale}
          >
            <SiteHeader dict={dict} />
            <div className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-6">{children}</div>
            <footer className="border-t border-line">
              <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm text-muted sm:px-6">
                <span>{GUILD_NAME} · Kult der Shadra · WoW Forever, PvP-EU, Horde</span>
                <LanguageSwitcher />
              </div>
            </footer>
          </BrandingProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
