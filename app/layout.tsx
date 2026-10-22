import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { getDictionary, getLocale } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { BrandingProvider } from "@/lib/branding";
import { getLogoUrl, getSiteSettings } from "@/lib/siteSettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

// Eigenes Logo (falls im Admin-Dashboard gesetzt) auch als Browser-Tab-Icon.
export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getLogoUrl();
  return {
    title: "WoW Forever Umfrage",
    description: "Umfrage unter Freunden zu World of Warcraft Forever",
    ...(logoUrl ? { icons: { icon: logoUrl, apple: logoUrl } } : {}),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = getDictionary(locale);
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
            <div className="mx-auto max-w-5xl px-4 py-8">
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
