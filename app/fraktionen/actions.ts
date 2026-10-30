"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { sanitizeRichHtml } from "@/lib/sanitize";
import type { CoreFigure } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(getDiscordId(user)))) {
    throw new Error("Nicht berechtigt.");
  }
}

function revalidateFactions() {
  revalidatePath("/fraktionen");
  revalidatePath("/admin/fraktionen");
  revalidatePath("/");
}

// ---------- Mitglieder: abstimmen (privat - siehe RLS in supabase/schema.sql) ----------

// Eine Stimme pro Person, bewusst "beim Aufheben gebunden" - es gibt
// absichtlich keine Möglichkeit für die Person selbst, die eigene
// Stimme zu ändern oder zurückzuziehen (siehe RLS in supabase/schema.sql).
export async function voteGuildDraft(draftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { error } = await supabase
    .from("guild_draft_votes")
    .insert({ user_id: user.id, draft_id: draftId });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/fraktionen");
}

// ---------- Admin: Stimme einer Person zurücksetzen (service_role, umgeht RLS) ----------

export async function adminResetGuildDraftVote(userId: string) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("guild_draft_votes").delete().eq("user_id", userId);

  if (error) {
    throw new Error(`Zurücksetzen fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/admin/fraktionen");
}

function parseCoreFigures(raw: FormDataEntryValue | null): CoreFigure[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((f) => ({
        icon: String(f?.icon ?? "").trim().slice(0, 8),
        label: String(f?.label ?? "").trim().slice(0, 60),
      }))
      .filter((f) => f.icon || f.label)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function textOrNull(value: FormDataEntryValue | null, maxLength = 500): string | null {
  const trimmed = String(value ?? "").trim().slice(0, maxLength);
  return trimmed || null;
}

function buildPayload(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60),
    name: String(formData.get("name") ?? "").trim().slice(0, 100),
    tagline: textOrNull(formData.get("tagline"), 100),
    summary: textOrNull(formData.get("summary"), 500),
    lore_html: sanitizeRichHtml(String(formData.get("lore_html") ?? "")) || null,
    rank_structure_html:
      sanitizeRichHtml(String(formData.get("rank_structure_html") ?? "")) || null,
    tooltip_title: textOrNull(formData.get("tooltip_title"), 100),
    tooltip_meta: textOrNull(formData.get("tooltip_meta"), 300),
    tooltip_effects: textOrNull(formData.get("tooltip_effects"), 1000),
    tooltip_quote: textOrNull(formData.get("tooltip_quote"), 300),
    image_url: textOrNull(formData.get("image_url"), 1000),
    tabard_url: textOrNull(formData.get("tabard_url"), 1000),
    tabard_icon_url: textOrNull(formData.get("tabard_icon_url"), 1000),
    stylesheet_url: textOrNull(formData.get("stylesheet_url"), 1000),
    core_figures: parseCoreFigures(formData.get("core_figures")),
    sitz: textOrNull(formData.get("sitz"), 200),
    anfuehrer: textOrNull(formData.get("anfuehrer"), 100),
    feinde: textOrNull(formData.get("feinde"), 200),
    primaerwert: textOrNull(formData.get("primaerwert"), 50),
  };
}

export async function createGuildDraft(formData: FormData) {
  await requireAdmin();
  const payload = buildPayload(formData);

  if (!payload.slug || !payload.name) {
    throw new Error("Slug und Name sind erforderlich.");
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("guild_drafts").insert(payload);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Dieser Slug wird schon verwendet.");
    }
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateFactions();
}

export async function updateGuildDraft(id: string, formData: FormData) {
  await requireAdmin();
  const payload = buildPayload(formData);

  if (!payload.slug || !payload.name) {
    throw new Error("Slug und Name sind erforderlich.");
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("guild_drafts")
    .update(payload)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Dieser Slug wird schon verwendet.");
    }
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateFactions();
}

export async function deleteGuildDraft(id: string) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("guild_drafts").delete().eq("id", id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidateFactions();
}

// Setzt diesen Entwurf aktiv und alle anderen inaktiv (kein DB-Constraint
// dafür, siehe Kommentar in supabase/schema.sql).
export async function activateGuildDraft(id: string) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { error: resetError } = await adminSupabase
    .from("guild_drafts")
    .update({ active: false })
    .neq("id", id);
  if (resetError) {
    throw new Error(`Speichern fehlgeschlagen: ${resetError.message}`);
  }

  const { error } = await adminSupabase
    .from("guild_drafts")
    .update({ active: true })
    .eq("id", id);
  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateFactions();
}
