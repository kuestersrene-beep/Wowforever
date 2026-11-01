import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import {
  SCAN_SOURCES,
  UPLOAD_STATUS_LABEL,
  getAccessRoles,
  hasGoldRadarAccess,
  uploadRulesets,
  type UploadRow,
} from "@/lib/goldRadar";
import UploadForm from "./UploadForm";

export const metadata = { title: "Scan hochladen · Blackwater Terminal", robots: { index: false } };

// Standard-Installationsort von WoW Forever; der Account-Ordner ist bei jedem anders.
const WOW_PATH = "C:\\Program Files (x86)\\World of Warcraft\\_forever_\\WTF\\Account";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

// Mitglieder mit Zugangsrolle laden hier ihre Tradeskills-Datei hoch. Alle
// Uploads zusammen ergeben die Live-Preise im Tool (gold-radar-worker).
export default async function GoldRadarUploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const discordId = getDiscordId(user);
  if (!(await hasGoldRadarAccess(discordId))) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="heading-ornate text-2xl">Scan hochladen</h1>
        <p className="panel p-5 text-slate-300">
          Dafür brauchst du im Gilden-Discord die Rolle <b className="text-gold-light">{getAccessRoles().join(" oder ")}</b>.
        </p>
      </main>
    );
  }

  const db = createAdminClient();
  const rulesets = uploadRulesets();
  const [{ data: mine }, { data: latest }, { count: recent }] = await Promise.all([
    db
      .from("gold_radar_uploads")
      .select("id, discord_id, display_name, ruleset, size_bytes, status, message, items, created_at, processed_at")
      .eq("discord_id", discordId!)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<UploadRow[]>(),
    db
      .from("gold_radar_uploads")
      .select("created_at")
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    db
      .from("gold_radar_uploads")
      .select("discord_id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-ornate text-2xl">Scan hochladen</h1>
        <Link href="/gold-radar" className="text-sm text-gold-light hover:underline">
          ← Zum Tool
        </Link>
      </div>

      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        Jeder Scan macht die Preise im Tool für alle genauer. Am meisten hilft es, wenn über den Tag
        verteilt immer wieder jemand scannt: Dann sieht das Tool, wie schnell Ware verkauft wird.
        {latest?.created_at ? ` Letzter übernommener Scan: ${fmt(latest.created_at)}.` : " Noch kein Scan übernommen."}
        {recent ? ` Übernommene Uploads in den letzten 7 Tagen: ${recent}.` : ""}
      </p>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">So geht&apos;s</h2>
        <ol className="list-decimal pl-5 text-sm text-slate-300">
          <li>Eines dieser Addons im WoW-Forever-Ordner haben (einmalig installieren):</li>
        </ol>
        <ul className="flex flex-col gap-1 pl-5 text-sm">
          {SCAN_SOURCES.map((s) => (
            <li key={s.file}>
              <b className="text-gold-light">{s.addon}</b> &rarr; Datei <code>{s.file}</code>
              <div className="text-xs text-slate-500">{s.note}</div>
            </li>
          ))}
        </ul>
        <ol start={2} className="list-decimal pl-5 text-sm text-slate-300">
          <li>Im Spiel das Auktionshaus öffnen und mit dem Addon scannen (bei AuctionDB: Komplett-Scan).</li>
          <li>
            <b>/reload</b> eingeben oder ausloggen. Erst dann schreibt das Spiel die Datei.
          </li>
          <li>
            Die Datei hier hochladen. Sie enthält Auktionshaus-Preise und Addon-Einstellungen, keine Zugangsdaten.
            Hast du mehrere der Addons, lade die Dateien nacheinander hoch.
          </li>
        </ol>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <UploadForm rulesets={rulesets} wowPath={WOW_PATH} />
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">Deine letzten Uploads</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {(mine ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap gap-x-3">
              <span className="text-slate-400">{fmt(u.created_at)}</span>
              <span className={u.status === "error" ? "text-red-400" : u.status === "done" ? "text-green-400" : "text-slate-300"}>
                {UPLOAD_STATUS_LABEL[u.status]}
              </span>
              {u.items != null && <span className="text-slate-400">{u.items} Preise</span>}
              {u.message && <span className="text-slate-500">{u.message}</span>}
            </li>
          ))}
          {(mine ?? []).length === 0 && <li className="text-slate-500">Noch nichts hochgeladen.</li>}
        </ul>
      </section>
    </main>
  );
}
