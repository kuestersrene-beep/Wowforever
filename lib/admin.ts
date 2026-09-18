import type { User } from "@supabase/supabase-js";

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

function getAdminIds(): string[] {
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdmin(discordId: string | null): boolean {
  if (!discordId) return false;
  return getAdminIds().includes(discordId);
}
