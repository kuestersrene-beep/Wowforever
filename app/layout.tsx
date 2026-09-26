import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { getDictionary, getLocale } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
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

export const metadata: Metadata = {
  title: "WoW Forever Umfrage",
  description: "Umfrage unter Freunden zu World of Warcraft Forever",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <html lang={locale} className={`${cinzel.variable} ${inter.variable}`}>
      <body className="min-h-screen font-sans">
        <LocaleProvider locale={locale} dict={dict}>
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-2 flex justify-end">
              <LanguageSwitcher />
            </div>
            {children}
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
