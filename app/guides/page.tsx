import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = { title: "Guides · WoW Forever" };

// Öffentlich (nicht in protectedPaths): die Guides sind zum Teilen gedacht.
export default function GuidesPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Guides</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          ← Startseite
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Faktengeprüfte Guides zu WoW Forever, abgeglichen mit Wowhead und ForeverChanges.
        Items, Perks und Lagerobjekte zeigen beim Darüberfahren ihren Tooltip.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            className="panel flex flex-col gap-2 p-6 transition hover:border-gold/70 hover:brightness-110"
          >
            <span className="text-xs uppercase tracking-wider text-slate-500">{g.topic}</span>
            <h2 className="font-heading text-lg text-gold-light">{g.title}</h2>
            <p className="text-sm text-slate-400">{g.description}</p>
            <span className="mt-auto pt-2 text-sm text-gold-light">Guide öffnen →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
