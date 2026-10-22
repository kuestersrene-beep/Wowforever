"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { CONTENT_FIELDS, CONTENT_TOGGLES } from "@/lib/contentFields";
import { sanitizeRichHtml } from "@/lib/sanitize";

const MAX_TEXT_LENGTH = 500;
const MAX_RICH_LENGTH = 10000;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }
}

// Speichert geänderte Texte einer Sprache. value === null bedeutet
// "zurück zum eingebauten Text" (Zeile wird gelöscht).
export async function saveContent(
  locale: "de" | "en",
  entries: { key: string; value: string | null }[]
) {
  await requireAdmin();

  if (locale !== "de" && locale !== "en") {
    throw new Error("Ungültige Sprache.");
  }

  const upserts: { key: string; locale: string; value: string }[] = [];
  const deletes: string[] = [];

  for (const { key, value } of entries) {
    const field = CONTENT_FIELDS.get(key);
    if (!field) continue;

    let cleaned: string | null = null;
    if (value !== null) {
      cleaned =
        field.kind === "rich"
          ? sanitizeRichHtml(value).slice(0, MAX_RICH_LENGTH)
          : value.trim().slice(0, MAX_TEXT_LENGTH);
      // Ein leerer Editor liefert "<p></p>" - zählt als leer.
      const isEmpty = !cleaned.replace(/<[^>]*>/g, "").trim();
      if (isEmpty) cleaned = null;
    }

    if (cleaned === null) {
      deletes.push(key);
    } else {
      upserts.push({ key, locale, value: cleaned });
    }
  }

  // service_role Key nötig: site_content hat für normale Nutzer:innen nur
  // eine select-Policy (siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  if (upserts.length > 0) {
    const { error } = await adminSupabase.from("site_content").upsert(upserts);
    if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }
  if (deletes.length > 0) {
    const { error } = await adminSupabase
      .from("site_content")
      .delete()
      .eq("locale", locale)
      .in("key", deletes);
    if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  // Texte erscheinen auf allen Seiten.
  revalidatePath("/", "layout");
}

// Abschnitt ein- oder ausblenden (gilt für alle Sprachen).
export async function setSectionVisible(key: string, visible: boolean) {
  await requireAdmin();

  if (!CONTENT_TOGGLES.has(key)) {
    throw new Error("Unbekannter Abschnitt.");
  }

  const adminSupabase = createAdminClient();
  const { error } = visible
    ? await adminSupabase.from("site_content").delete().eq("key", key).eq("locale", "all")
    : await adminSupabase
        .from("site_content")
        .upsert({ key, locale: "all", value: "false" });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/", "layout");
}
