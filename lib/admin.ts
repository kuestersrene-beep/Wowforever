import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";

// Discord OAuth über Supabase legt die Discord-User-ID im Feld
// "provider_id" (bzw. bei manchen Setups "sub") der user_metadata ab.
export function getDiscordId(user: User): string | null {
  const meta = user.user_metadata ?? {};
  return meta.provider_id ?? meta.sub ?? null;
}

export function getDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  return meta.full_name ?? meta.name ?? meta.custom_claims?.global_name ?? "Unbekannt";
}

export function getAvatarUrl(user: User): string | null {
  const meta = user.user_metadata ?? {};
  return meta.avatar_url ?? meta.picture ?? null;
}

// Discord-Ränge, die auf der Website Admin-Rechte haben. Die Ränge meldet
// der Gilden-Bot (discord-setup/rollensync.py) in die Tabelle
// discord_members - wer in Discord befördert wird, ist nach spätestens
// ein paar Minuten auch hier Admin.
export const ADMIN_RANKS = ["Gildenmeister", "Offizier"];

// Feste Admins aus der Umgebung - als Notfall-Zugang, falls der Bot nicht
// läuft oder die Ränge noch nicht gemeldet hat.
function getAdminIds(): string[] {
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

// cache(): pro Seitenaufruf nur eine Datenbankabfrage, auch wenn mehrere
// Stellen prüfen. service_role nötig, weil discord_members bewusst keine
// Policies hat (siehe supabase/schema.sql).
export const isAdmin = cache(async (discordId: string | null): Promise<boolean> => {
  if (!discordId) return false;
  if (getAdminIds().includes(discordId)) return true;
  try {
    const { data } = await createAdminClient()
      .from("discord_members")
      .select("ranks")
      .eq("discord_id", discordId)
      .maybeSingle<{ ranks: string[] }>();
    return (data?.ranks ?? []).some((rank) => ADMIN_RANKS.includes(rank));
  } catch {
    return false;
  }
});
