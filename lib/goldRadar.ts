import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/admin";

// Gold-Radar: das Auktionshaus-/Nachfrage-Tool aus dem Projekt
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
