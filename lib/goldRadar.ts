import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/admin";

// Blackwater Terminal (früher Gold-Radar): das Auktionshaus-/Nachfrage-Tool aus dem Projekt
// WowForever-Gold (ah/dashboard.py erzeugt eine einzelne HTML-Datei).
// Die Datei liegt im privaten Supabase-Storage-Bucket "gold-radar" unter
// "<ruleset>/dashboard.html" (z. B. "pvp-eu-horde/dashboard.html") und wird
// nur über app/gold-radar/app/route.ts ausgeliefert - nie öffentlich.
// Ein Ordner pro Ruleset + Region + Fraktion (= ein Auktionshaus), damit
// später weitere Daten (z. B. Scans von Mitgliedern) danebengelegt und
// geteilt werden können.
export const GOLD_RADAR_BUCKET = "gold-radar";
export const DASHBOARD_FILE = "dashboard.html";

export function defaultRuleset(): string {
  return process.env.GOLD_RADAR_RULESET || "pvp-eu-horde";
}

export function isValidRuleset(value: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(value);
}

// Auktionshäuser, für die Mitglieder Scans hochladen dürfen (Komma-Liste,
// z. B. "pvp-eu-horde,pvp-eu-alliance"). Standard: das eine Ruleset der Gilde.
export function uploadRulesets(): string[] {
  const list = (process.env.GOLD_RADAR_RULESETS || defaultRuleset())
    .split(",")
    .map((r) => r.trim())
    .filter(isValidRuleset);
  return list.length ? list : [defaultRuleset()];
}

// Gemeinsame Scans: SavedVariables-Dateien der AH-Addons der Mitglieder (Leser: gold-radar-worker/tool/ah/scanfiles.py)
// (siehe app/gold-radar/upload und gold-radar-worker/worker.py), beste zuerst.
// marker = Variable in der Datei, an der der Upload sie erkennt.
// tier = Empfehlung (S am besten); prices/quantity/intraday/history = was die Datei liefert
// ("ja" | "teils" | "nein"), daraus folgt, welche Teile des Tools damit funktionieren.
export type Coverage = "ja" | "teils" | "nein";
export interface ScanSource {
  tier: "S" | "A" | "B" | "C";
  addon: string;
  file: string;
  marker: string;
  prices: Coverage;
  quantity: Coverage;
  intraday: Coverage;
  history: string;
  note: string;
  url?: string;
}
export const SCAN_SOURCES: readonly ScanSource[] = [
  { tier: "S", addon: "AuctionDB (AHDB von MooreaTV)", file: "AuctionDB.lua", marker: "AuctionDB",
    prices: "ja", quantity: "ja", intraday: "ja", history: "7 Tage jeder Scan, dazu 180 Tage Tageswerte",
    note: "Scannt beim Öffnen des Auktionshauses automatisch das ganze AH (höchstens alle 15 Minuten), mit Tiefstpreis, Median und Menge. Damit funktioniert alles.",
    url: "https://github.com/mooreatv/AuctionDB/releases" },
  { tier: "A", addon: "Tradeskills", file: "Blackthornes_TS.lua", marker: "BlackthornesTSDB",
    prices: "ja", quantity: "ja", intraday: "ja", history: "die letzten 12 Messungen je Item",
    note: "Preis und Menge je Messung. Gut, solange regelmäßig gescannt wird." },
  { tier: "B", addon: "Auctionator", file: "Auctionator.lua", marker: "AUCTIONATOR_PRICE_DATABASE",
    prices: "ja", quantity: "teils", intraday: "nein", history: "ein Wert pro Tag (Standard 21 Tage)",
    note: "Haben die meisten. Ein Preis und eine Menge pro Tag: gut für Preise und Trends, kein Abverkauf." },
  { tier: "C", addon: "aux", file: "aux-addon.lua", marker: "aux = {",
    prices: "ja", quantity: "nein", intraday: "nein", history: "ein Wert pro Tag (bis 11 Tage)",
    note: "Tagestiefstpreis ohne Mengen: nur Preise und Trends." },
];
export const SCAN_FILE_MAX_BYTES = 9 * 1024 * 1024; // bodySizeLimit in next.config.ts ist 10 MB
export const SCAN_UPLOADS_PER_DAY = 24;
// Das Modell (dashboard-teilen.html) liegt hier; der Worker baut daraus
// mit den Live-Daten <ruleset>/dashboard.html.
export const MODEL_FILE = "model.html";

export type UploadStatus = "pending" | "done" | "error" | "revoke" | "revoked";

export interface UploadRow {
  id: string;
  discord_id: string;
  display_name: string | null;
  ruleset: string;
  size_bytes: number | null;
  status: UploadStatus;
  message: string | null;
  items: number | null;
  created_at: string;
  processed_at: string | null;
}

export const UPLOAD_STATUS_LABEL: Record<UploadStatus, string> = {
  pending: "wartet auf Verarbeitung",
  done: "übernommen",
  error: "Fehler",
  revoke: "wird zurückgenommen",
  revoked: "zurückgenommen",
};

// Discord-Rollen, die Zugang zum Tool geben. Der Gilden-Bot meldet sie
// (wie die Ränge) in die Tabelle discord_members (discord-setup/rollensync.py).
export function getAccessRoles(): string[] {
  return (process.env.GOLD_RADAR_ROLES || "Gold-Radar")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

// Wer sehen darf, wer das Tool benutzt, und neue Daten hochladen darf.
// Bewusst NICHT die normalen Admins/Offiziere, sondern nur die hier
// eingetragenen Discord-IDs.
export function isGoldRadarOwner(discordId: string | null): boolean {
  if (!discordId) return false;
  return (process.env.GOLD_RADAR_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(discordId);
}

export const hasGoldRadarAccess = cache(async (discordId: string | null): Promise<boolean> => {
  if (!discordId) return false;
  if (isGoldRadarOwner(discordId)) return true;
  try {
    const { data } = await createAdminClient()
      .from("discord_members")
      .select("ranks")
      .eq("discord_id", discordId)
      .maybeSingle<{ ranks: string[] }>();
    const roles = getAccessRoles();
    return (data?.ranks ?? []).some((rank) => roles.includes(rank));
  } catch {
    return false;
  }
});

export type UsageEvent = "open" | "denied";

// Aufrufe derselben Person innerhalb dieses Zeitraums zählen als ein
// Besuch - sonst füllt jedes Neuladen die Liste.
const DEDUPE_MINUTES = 15;

// Protokolliert einen Aufruf. Fehler dürfen den Zugang nie blockieren,
// deshalb wird nur geloggt statt geworfen.
export async function logUsage(
  user: User,
  discordId: string,
  event: UsageEvent,
  ruleset: string | null
): Promise<void> {
  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    const { count } = await db
      .from("gold_radar_usage")
      .select("id", { count: "exact", head: true })
      .eq("discord_id", discordId)
      .eq("event", event)
      .gte("created_at", since);
    if (count) return;
    await db.from("gold_radar_usage").insert({
      discord_id: discordId,
      display_name: getDisplayName(user),
      event,
      ruleset,
    });
  } catch (err) {
    console.error("Gold-Radar: Aufruf konnte nicht protokolliert werden:", err);
  }
}

export async function loadDashboard(ruleset: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(GOLD_RADAR_BUCKET)
    .download(`${ruleset}/${DASHBOARD_FILE}`);
  if (error || !data) return null;
  return data.text();
}
