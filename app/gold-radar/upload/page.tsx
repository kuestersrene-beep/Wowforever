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

const TIER_STYLE: Record<string, string> = {
  S: "bg-gold text-ink",
  A: "bg-green-500/80 text-ink",
  B: "bg-sky-500/70 text-ink",
  C: "bg-slate-500/70 text-ink",
};
const COVER_STYLE: Record<string, string> = { ja: "text-green-400", teils: "text-gold-light", nein: "text-slate-500" };

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
              <span className={`mr-2 inline-block w-5 rounded text-center text-xs font-bold ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
              <b className="text-gold-light">{s.addon}</b> &rarr; Datei <code>{s.file}</code>
            </li>
          ))}
        </ul>
        <p className="pl-5 text-xs text-slate-500">Welches Addon was liefert, steht unten in der Übersicht.</p>
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
        <h2 className="font-heading text-lg text-gold-light">Welches Addon? Empfehlung und Übersicht</h2>
        <p className="text-sm text-slate-300">
          Am meisten bringt <b>AuctionDB</b>: Nur mit mehreren Scans am Tag inklusive Menge sieht das Tool, wie schnell
          Ware verkauft wird (Flips, „Leerkauf droht“). Jede Datei hilft aber, auch Auctionator oder aux. Hast du
          mehrere Addons, lade alle Dateien hoch.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-1 pr-3">Tier</th>
                <th className="py-1 pr-3">Addon</th>
                <th className="py-1 pr-3">Preise</th>
                <th className="py-1 pr-3">Menge im AH</th>
                <th className="py-1 pr-3">Mehrmals am Tag</th>
                <th className="py-1">Verlauf</th>
              </tr>
            </thead>
            <tbody>
              {SCAN_SOURCES.map((s) => (
                <tr key={s.file} className="border-t border-gold/10 align-top">
                  <td className="py-1.5 pr-3">
                    <span className={`inline-block w-5 rounded text-center text-xs font-bold ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <b className="text-gold-light">{s.addon}</b>
                    <div className="text-xs text-slate-500">{s.note}</div>
                  </td>
                  <td className={`py-1.5 pr-3 ${COVER_STYLE[s.prices]}`}>{s.prices}</td>
                  <td className={`py-1.5 pr-3 ${COVER_STYLE[s.quantity]}`}>{s.quantity}</td>
                  <td className={`py-1.5 pr-3 ${COVER_STYLE[s.intraday]}`}>{s.intraday}</td>
                  <td className="py-1.5 text-xs text-slate-400">{s.history}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-[auto_1fr]">
          <dt className="text-slate-300">Preise</dt>
          <dd>Aktuelle Preise, Trends, Veredeln, Händler-Shuffle, Favor-Index. Klappt mit jedem Addon.</dd>
          <dt className="text-slate-300">Menge im AH</dt>
          <dd>Wie viel angeboten wird: Konfidenz der Preise und Signale wie „Akkumulation“. „teils“ = nur ein Wert pro Tag.</dd>
          <dt className="text-slate-300">Mehrmals am Tag</dt>
          <dd>Mehrere Messungen am selben Tag zeigen den Abverkauf. Den brauchen AH-Flips und „Leerkauf droht“.</dd>
        </dl>
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
