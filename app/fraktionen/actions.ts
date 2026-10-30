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

function urlOrNull(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
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
    tagline: urlOrNull(formData.get("tagline")),
    summary: urlOrNull(formData.get("summary")),
    lore_html: sanitizeRichHtml(String(formData.get("lore_html") ?? "")) || null,
    rank_structure_html:
      sanitizeRichHtml(String(formData.get("rank_structure_html") ?? "")) || null,
    tooltip_title: urlOrNull(formData.get("tooltip_title")),
    tooltip_html: sanitizeRichHtml(String(formData.get("tooltip_html") ?? "")) || null,
    image_url: urlOrNull(formData.get("image_url")),
    crest_url: urlOrNull(formData.get("crest_url")),
    tabard_url: urlOrNull(formData.get("tabard_url")),
    banner_url: urlOrNull(formData.get("banner_url")),
    core_figures: parseCoreFigures(formData.get("core_figures")),
    sitz: urlOrNull(formData.get("sitz")),
    anfuehrer: urlOrNull(formData.get("anfuehrer")),
    feinde: urlOrNull(formData.get("feinde")),
    primaerwert: urlOrNull(formData.get("primaerwert")),
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
