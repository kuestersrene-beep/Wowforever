import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WoW Forever Umfrage",
  description: "Umfrage unter Freunden zu World of Warcraft Forever",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
