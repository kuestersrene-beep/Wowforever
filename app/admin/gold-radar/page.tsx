import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import { discordUserUrl } from "@/lib/discordUrl";
import {
  DASHBOARD_FILE,
  GOLD_RADAR_BUCKET,
  FEEDBACK_STATUS_LABEL,
  UPLOAD_STATUS_LABEL,
  defaultRuleset,
  getAccessRoles,
  isGoldRadarOwner,
  type FeedbackRow,
  type UploadRow,
} from "@/lib/goldRadar";
import { pruneUsage, revokeUpload, setFeedbackStatus, uploadDashboard } from "./actions";

interface UsageRow {
  discord_id: string;
  display_name: string | null;
  event: "open" | "denied";
  ruleset: string | null;
  created_at: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  });

// Nur für die in GOLD_RADAR_ADMIN_IDS eingetragenen Personen: wer nutzt das
// Tool (Blackwater Terminal), und neue Tool-Daten hochladen. Normale Admins sehen das nicht.
export default async function GoldRadarAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isGoldRadarOwner(getDiscordId(user))) {
    redirect("/");
  }

  const db = createAdminClient();
  const [{ data: usage, error }, { data: folders }, { data: uploads }, { data: feedback }] = await Promise.all([
    db
      .from("gold_radar_usage")
      .select("discord_id, display_name, event, ruleset, created_at")
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<UsageRow[]>(),
    db.storage.from(GOLD_RADAR_BUCKET).list("", { limit: 100 }),
    db
      .from("gold_radar_uploads")
      .select("id, discord_id, display_name, ruleset, size_bytes, status, message, items, created_at, processed_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<UploadRow[]>(),
    db
      .from("gold_radar_feedback")
      .select("id, discord_id, display_name, ruleset, kind, message, context, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<FeedbackRow[]>(),
  ]);
  const openFeedback = (feedback ?? []).filter((f) => f.status !== "erledigt").length;

  const rows = usage ?? [];
  const people = new Map<
    string,
    { name: string; opens: number; denied: number; first: string; last: string }
  >();
  for (const r of rows) {
    const p = people.get(r.discord_id) ?? {
      name: r.display_name ?? r.discord_id,
      opens: 0,
      denied: 0,
      first: r.created_at,
      last: r.created_at,
    };
    if (r.event === "open") p.opens += 1;
    else p.denied += 1;
    if (r.created_at < p.first) p.first = r.created_at;
    if (r.created_at > p.last) p.last = r.created_at;
    people.set(r.discord_id, p);
  }
  const persons = [...people.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last));

  // Aktuelle Datei je Ruleset-Ordner (Ordner = ein Auktionshaus)
  const files = await Promise.all(
    (folders ?? [])
      .filter((f) => !f.metadata && f.name !== "uploads" && f.name !== "status") // Ordner haben keine Metadaten
      .map(async (f) => {
        const { data } = await db.storage.from(GOLD_RADAR_BUCKET).list(f.name);
        const file = (data ?? []).find((x) => x.name === DASHBOARD_FILE);
        return { ruleset: f.name, updated: file?.updated_at ?? null, size: file?.metadata?.size ?? null };
      })
  );

  // Status des Blizzard-Imports (gold-radar-worker, stündlich): Ziele, Fehler, Forever-Realms zur Auswahl
  type BlizzTarget = { target: string; ok?: boolean; error?: string | null; items?: number; auctions?: number; dump?: string; checked?: string; realms?: string[]; realms_used?: string[] };
  let blizz: { checked?: string; targets?: Record<string, BlizzTarget>; forever_realms?: { eu?: string[] } } | null = null;
  try {
    const { data } = await db.storage.from(GOLD_RADAR_BUCKET).download("status/blizzard.json");
    if (data) blizz = JSON.parse(await data.text());
  } catch {
    blizz = null;
  }

  // Status der TSM-Suche (gold-radar-worker prüft täglich, ob TradeSkillMaster WoW-Forever-Daten anbietet)
  let tsm: { checked?: string; found?: string | null; ruleset?: string | null } | null = null;
  try {
    const { data } = await db.storage.from(GOLD_RADAR_BUCKET).download("status/tsm.json");
    if (data) tsm = JSON.parse(await data.text());
  } catch {
    tsm = null;
  }

  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Blackwater Terminal: Nutzung &amp; Daten</h1>
        <Link href="/gold-radar" className="text-sm text-gold-light hover:underline">
          ← Zum Tool
        </Link>
      </div>

      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        Zugang hat, wer im Discord die Rolle <b>{getAccessRoles().join(" / ")}</b> hat (Bot-Sync
        alle 2 Minuten). Diese Seite sehen nur die Discord-IDs aus <code>GOLD_RADAR_ADMIN_IDS</code>.
        Aufrufe derselben Person innerhalb von 15 Minuten zählen einmal.
      </p>

      {error && <p className="text-red-400">Protokoll konnte nicht geladen werden: {error.message}</p>}

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">Wer nutzt das Tool ({persons.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-1 pr-4">Discord</th>
                <th className="py-1 pr-4 text-right">Besuche</th>
                <th className="py-1 pr-4 text-right">Abgewiesen</th>
                <th className="py-1 pr-4">Erster Besuch</th>
                <th className="py-1">Letzter Besuch</th>
              </tr>
            </thead>
            <tbody>
              {persons.map(([id, p]) => (
                <tr key={id} className="border-t border-gold/10">
                  <td className="py-1 pr-4">
                    <a href={discordUserUrl(id)} target="_blank" rel="noopener" className="hover:underline">
                      {p.name}
                    </a>
                  </td>
                  <td className="py-1 pr-4 text-right">{p.opens}</td>
                  <td className={`py-1 pr-4 text-right ${p.denied ? "text-horde" : ""}`}>{p.denied}</td>
                  <td className="py-1 pr-4">{fmt(p.first)}</td>
                  <td className="py-1">{fmt(p.last)}</td>
                </tr>
              ))}
              {persons.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-slate-500">
                    Noch keine Aufrufe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">Letzte Aufrufe</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {rows.slice(0, 50).map((r, i) => (
            <li key={i} className="flex flex-wrap gap-x-3">
              <span className="text-slate-400">{fmt(r.created_at)}</span>
              <span>{r.display_name ?? r.discord_id}</span>
              {r.event === "denied" ? (
                <span className="text-horde">ohne Rolle abgewiesen</span>
              ) : (
                <span className="text-slate-400">{r.ruleset}</span>
              )}
            </li>
          ))}
        </ul>
        <form action={pruneUsage} className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-slate-400">Einträge älter als</span>
          <input
            name="days"
            type="number"
            min={1}
            defaultValue={90}
            className="w-20 rounded border border-gold/30 bg-ink px-2 py-1"
          />
          <span className="text-slate-400">Tage</span>
          <button className="rounded border border-horde/60 px-3 py-1 text-horde hover:bg-horde/10">löschen</button>
        </form>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">
          Feedback aus dem Tool ({openFeedback} offen, {(feedback ?? []).length} gesamt)
        </h2>
        <p className="text-xs text-slate-500">
          Kommt über den Knopf &bdquo;Feedback&ldquo; im Tool. Bereich, Item, Profil und Browser schickt das Tool
          automatisch mit. Mit <code>GOLD_RADAR_FEEDBACK_WEBHOOK</code> in der <code>.env</code> geht zusätzlich eine
          kurze Meldung in einen Discord-Kanal.
        </p>
        <div className="flex flex-col gap-2">
          {(feedback ?? []).map((f) => (
            <div
              key={f.id}
              className={`rounded border px-3 py-2 text-sm ${f.status === "erledigt" ? "border-gold/10 opacity-60" : "border-gold/30"}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    f.kind === "Fehler" ? "bg-red-500/15 text-red-300" : f.kind === "Lob" ? "bg-green-500/15 text-green-300" : "bg-gold/10 text-gold-light"
                  }`}
                >
                  {f.kind}
                </span>
                <span>{fmt(f.created_at)}</span>
                <a href={discordUserUrl(f.discord_id)} target="_blank" rel="noopener" className="hover:underline">
                  {f.display_name ?? f.discord_id}
                </a>
                <span>{FEEDBACK_STATUS_LABEL[f.status] ?? f.status}</span>
                <span className="ml-auto flex gap-1">
                  {["gesehen", "erledigt", "neu"]
                    .filter((s) => s !== f.status)
                    .map((s) => (
                      <form key={s} action={setFeedbackStatus}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className="rounded border border-gold/30 px-2 py-0.5 text-xs hover:bg-gold/10">{s}</button>
                      </form>
                    ))}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-200">{f.message}</p>
              {f.context && Object.keys(f.context).length > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  {Object.entries(f.context)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
              )}
            </div>
          ))}
          {(feedback ?? []).length === 0 && <p className="text-slate-500">Noch kein Feedback.</p>}
        </div>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">Scan-Uploads der Mitglieder</h2>
        <p className="text-xs text-slate-500">
          Mitglieder laden unter <Link href="/gold-radar/upload" className="text-gold-light hover:underline">/gold-radar/upload</Link>{" "}
          ihre Tradeskills-Datei hoch; gold-radar-worker liest sie ein und baut die Tool-Seite neu.
          &bdquo;Zurücknehmen&ldquo; entfernt alle Preise, die ein Upload beigetragen hat.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-1 pr-4">Zeit</th>
                <th className="py-1 pr-4">Discord</th>
                <th className="py-1 pr-4">Auktionshaus</th>
                <th className="py-1 pr-4">Status</th>
                <th className="py-1 pr-4 text-right">Preise</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {(uploads ?? []).map((u) => (
                <tr key={u.id} className="border-t border-gold/10 align-top">
                  <td className="py-1 pr-4 text-slate-400">{fmt(u.created_at)}</td>
                  <td className="py-1 pr-4">
                    <a href={discordUserUrl(u.discord_id)} target="_blank" rel="noopener" className="hover:underline">
                      {u.display_name ?? u.discord_id}
                    </a>
                  </td>
                  <td className="py-1 pr-4 text-slate-400">{u.ruleset}</td>
                  <td className={`py-1 pr-4 ${u.status === "error" ? "text-red-400" : u.status === "done" ? "text-green-400" : "text-slate-300"}`}>
                    {UPLOAD_STATUS_LABEL[u.status]}
                    {u.message && <div className="text-xs text-slate-500">{u.message}</div>}
                  </td>
                  <td className="py-1 pr-4 text-right">{u.items ?? ""}</td>
                  <td className="py-1">
                    {["done", "error", "pending"].includes(u.status) && (
                      <form action={revokeUpload}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="rounded border border-horde/60 px-2 py-0.5 text-xs text-horde hover:bg-horde/10">
                          zurücknehmen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {(uploads ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-500">
                    Noch keine Uploads.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-heading text-lg text-gold-light">Tool-Daten</h2>
        <p className={`rounded border px-3 py-2 text-sm ${tsm?.found ? "border-green-500/50 text-green-300" : "border-gold/20 text-slate-400"}`}>
          {tsm?.found ? (
            <>
              <b>TradeSkillMaster bietet WoW-Forever-Daten an</b> ({tsm.found}). Der Dienst lädt sie alle 6 Stunden für{" "}
              {tsm.ruleset}. Dauerhaft festlegen: <code>GOLD_RADAR_TSM={tsm.ruleset}={tsm.found}</code> in der <code>.env</code>.
            </>
          ) : tsm?.checked ? (
            <>TradeSkillMaster: noch keine WoW-Forever-Daten (zuletzt geprüft {fmt(tsm.checked)}, täglich automatisch).</>
          ) : (
            <>TradeSkillMaster: noch nicht geprüft (der Dienst prüft einmal am Tag).</>
          )}
        </p>
        <div className="rounded border border-gold/20 px-3 py-2 text-sm text-slate-300">
          <b>Blizzard-API</b> (ganzes Auktionshaus, stündlich)
          {!blizz && <div className="text-slate-400">Noch kein Status. Braucht BLIZZARD_CLIENT_ID und BLIZZARD_CLIENT_SECRET in der .env.</div>}
          {blizz &&
            Object.entries(blizz.targets ?? {}).map(([key, t]) => (
              <div key={key} className={t.ok ? "text-green-300" : "text-slate-400"}>
                {key === "demo" ? "Demo" : key}: <code>{t.target}</code> –{" "}
                {t.ok
                  ? `${t.auctions} Auktionen, ${t.items} Items, Stand ${t.dump ? fmt(t.dump) : "?"}`
                  : `noch keine Daten (${t.error ?? "?"})`}
                {t.ok && key !== "demo" && t.realms_used?.length ? ` · gelesen: ${t.realms_used.join(", ")}` : ""}
              </div>
            ))}
          {blizz && (
            <div className="mt-1 text-slate-400">
              Jedes Ruleset liest sein Forever-Auktionshaus von selbst (z. B. pvp-eu-horde = alle PvP-Realms EU, Horde),
              sobald Blizzard es freigibt; nichts einzutragen.
              {(blizz.forever_realms?.eu ?? []).length > 0 && (
                <> Forever EU laut Blizzard derzeit: {(blizz.forever_realms?.eu ?? []).join(", ")}</>
              )}
            </div>
          )}
        </div>
        <ul className="text-sm">
          {files.map((f) => (
            <li key={f.ruleset}>
              <a href={`/gold-radar/app?r=${f.ruleset}`} target="_blank" rel="noopener" className="text-gold-light hover:underline">
                {f.ruleset}
              </a>{" "}
              <span className="text-slate-400">
                {f.updated ? `Stand ${fmt(f.updated)}` : "keine Datei"}
                {f.size ? ` · ${(f.size / 1_048_576).toFixed(1)} MB` : ""}
              </span>
            </li>
          ))}
          {files.length === 0 && <li className="text-slate-500">Noch nichts hochgeladen.</li>}
        </ul>
        <form action={uploadDashboard} className="flex flex-wrap items-center gap-2 text-sm">
          <input
            name="ruleset"
            defaultValue={defaultRuleset()}
            pattern="[a-z0-9-]{1,40}"
            className="w-40 rounded border border-gold/30 bg-ink px-2 py-1"
          />
          <input name="file" type="file" accept=".html,text/html" required className="text-slate-300" />
          <button className="rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-1 font-medium text-ink hover:brightness-110">
            Hochladen
          </button>
        </form>
        <p className="text-xs text-slate-500">
          Hochladen: <code>dashboard-teilen.html</code> aus <code>python ah/dashboard.py --teilen</code>{" "}
          (enthält das Nachfrage-Modell und die Beta-Demo). Ein Ordner je Ruleset-Region-Fraktion, z. B.{" "}
          <code>pvp-eu-horde</code>. Die Datei wird als Vorlage gespeichert; gold-radar-worker setzt die
          gemeinsamen Scans der Mitglieder ein und baut die Seite innerhalb weniger Minuten neu.
        </p>
      </section>
    </main>
  );
}
