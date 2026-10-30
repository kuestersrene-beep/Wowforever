import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { BrandingProvider } from "@/lib/branding";
import { getIconUrl, getSiteSettings } from "@/lib/siteSettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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

// Eigenes Logo (bevorzugt das quadratische Countdown-Logo, siehe
// getIconUrl) auch als Browser-Tab-Icon.
export async function generateMetadata(): Promise<Metadata> {
  const iconUrl = await getIconUrl();
  return {
    title: "WoW Forever Umfrage",
    description: "Umfrage unter Freunden zu World of Warcraft Forever",
    ...(iconUrl ? { icons: { icon: iconUrl, apple: iconUrl } } : {}),
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
      <body className="min-h-screen font-sans">
        <LocaleProvider locale={locale} dict={dict}>
          <BrandingProvider
            logoUrl={logoUrl}
            timerLogoUrl={timerLogoUrl}
            logoScale={logoScale}
          >
            <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
              <div className="mb-2 flex justify-end">
                <LanguageSwitcher />
              </div>
              {children}
            </div>
          </BrandingProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
