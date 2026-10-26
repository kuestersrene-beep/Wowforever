"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { isSectionVisible } from "@/lib/content";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, getDisplayName, isAdmin } from "@/lib/admin";
import { GUILD_NAME_MAX_LENGTH, MAX_GUILD_NAME_SUGGESTIONS } from "@/lib/constants";
import type { SuggestResult } from "@/lib/types";


function revalidatePoll() {
  revalidatePath("/gildenname");
  revalidatePath("/");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }
  return { supabase, user };
}

async function requireAdmin() {
  const { user } = await requireUser();
  if (!(await isAdmin(getDiscordId(user)))) {
    throw new Error("Nicht berechtigt.");
  }
}

// ---------- Mitglieder: vorschlagen, zurückziehen, abstimmen ----------

// Solange die Umfrage ausgeblendet ist, dürfen nur Admins vorschlagen und
// abstimmen (siehe "guildName.show" in lib/contentFields.ts).
async function requireVisibleOrAdmin(user: User) {
  if ((await isAdmin(getDiscordId(user)))) return;
  if (!(await isSectionVisible("guildName.show"))) {
    throw new Error("Die Gildennamen-Umfrage ist gerade nicht freigegeben.");
  }
}

export async function suggestGuildName(formData: FormData): Promise<SuggestResult> {
  const { supabase, user } = await requireUser();
  await requireVisibleOrAdmin(user);

  // Mehrfache Leerzeichen zusammenfassen, damit "Die  Horde" und
  // "Die Horde" als derselbe Name gelten.
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, GUILD_NAME_MAX_LENGTH);
  if (name.length < 2) {
    return { ok: false, reason: "invalid" };
  }

  const { count } = await supabase
    .from("guild_name_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("status", "abgelehnt");
  if ((count ?? 0) >= MAX_GUILD_NAME_SUGGESTIONS) {
    return { ok: false, reason: "limit" };
  }

  const { error } = await supabase.from("guild_name_suggestions").insert({
    name,
    user_id: user.id,
    display_name: getDisplayName(user),
    status: "offen",
  });

  if (error) {
    // 23505 = Unique-Index auf lower(name) verletzt.
    if (error.code === "23505") {
      return { ok: false, reason: "duplicate" };
    }
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePoll();
  return { ok: true };
}

export async function withdrawGuildName(id: string) {
  const { supabase, user } = await requireUser();

  // Die RLS-Policy erlaubt nur eigene, noch offene Vorschläge.
  const { error } = await supabase
    .from("guild_name_suggestions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePoll();
}

export async function voteGuildName(suggestionId: string) {
  const { supabase, user } = await requireUser();
  await requireVisibleOrAdmin(user);

  // Eine Stimme pro Person - eine neue Wahl ersetzt die alte. Dass nur
  // freigegebene Namen gewählt werden können, prüft die RLS-Policy.
  const { error } = await supabase
    .from("guild_name_votes")
    .upsert({ user_id: user.id, suggestion_id: suggestionId });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePoll();
}

export async function removeGuildNameVote() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("guild_name_votes")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePoll();
}

// ---------- Admin: freigeben, ablehnen, löschen ----------

export async function moderateGuildName(
  id: string,
  status: "freigegeben" | "abgelehnt"
) {
  await requireAdmin();

  if (status !== "freigegeben" && status !== "abgelehnt") {
    throw new Error("Ungültiger Status.");
  }

  // service_role Key nötig: normale Nutzer:innen dürfen den Status nicht
  // ändern (keine update-Policy, siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("guild_name_suggestions")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  // Wird ein bereits freigegebener Name abgelehnt, fallen seine Stimmen
  // weg - die Leute können dann neu wählen.
  if (status === "abgelehnt") {
    await adminSupabase.from("guild_name_votes").delete().eq("suggestion_id", id);
  }

  revalidatePoll();
}

export async function deleteGuildName(id: string) {
  await requireAdmin();

  // Stimmen werden per "on delete cascade" mit entfernt.
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("guild_name_suggestions")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePoll();
}
