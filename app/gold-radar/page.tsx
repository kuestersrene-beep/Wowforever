import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import {
  getAccessRoles,
  hasGoldRadarAccess,
  isGoldRadarOwner,
  logUsage,
} from "@/lib/goldRadar";

export const metadata = { title: "Blackwater Terminal", robots: { index: false } };

export default async function GoldRadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const discordId = getDiscordId(user);
  const access = await hasGoldRadarAccess(discordId);

  if (!access) {
    if (discordId) await logUsage(user, discordId, "denied", null);
    return (
      <main className="flex flex-col gap-4">
        <h1 className="heading-ornate text-2xl">Blackwater Terminal</h1>
        <p className="panel p-5 text-slate-300">
          Für Blackwater Terminal brauchst du im Gilden-Discord die Rolle{" "}
          <b className="text-gold-light">{getAccessRoles().join(" oder ")}</b>. Frag
          einen Offizier. Nach der Vergabe dauert es bis zu ein paar Minuten, bis der
          Zugang hier ankommt.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-ornate text-2xl">Blackwater Terminal</h1>
        <div className="flex gap-4 text-sm">
          {isGoldRadarOwner(discordId) && (
            <Link href="/admin/gold-radar" className="text-horde hover:underline">
              Nutzung &amp; Daten
            </Link>
          )}
          <Link href="/gold-radar/upload" className="text-gold-light hover:underline">
            Scan hochladen
          </Link>
          <a href="/gold-radar/app" target="_blank" rel="noopener" className="text-gold-light hover:underline">
            Im eigenen Tab öffnen ↗
          </a>
        </div>
      </div>
      <iframe
        src="/gold-radar/app"
        title="Blackwater Terminal"
        className="h-[calc(100vh-10rem)] min-h-[600px] w-full rounded-lg border border-gold/30 bg-white"
      />
      <p className="text-xs text-slate-500">
        Nur für Gildenmitglieder mit Zugangsrolle, bitte nicht weitergeben. Aufrufe werden
        mit Discord-Name und Zeitpunkt protokolliert.
      </p>
    </main>
  );
}
