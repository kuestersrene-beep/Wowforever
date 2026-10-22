import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { CONTENT_FIELDS, CONTENT_TOGGLES } from "@/lib/contentFields";
import { sanitizeRichHtml } from "@/lib/sanitize";

export interface SiteContentRow {
  key: string;
  locale: "de" | "en" | "all";
  value: string;
}

// Alle im Admin-Dashboard geänderten Texte (siehe site_content in
// supabase/schema.sql), einmal pro Seitenaufruf geladen. Fehler (z. B.
// Schema noch nicht eingespielt) führen zu "keine Änderungen" - dann
// gelten einfach die eingebauten Texte.
export const loadSiteContent = cache(async (): Promise<SiteContentRow[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_content")
      .select("key, locale, value")
      .returns<SiteContentRow[]>();
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
});

// Eingebautes Wörterbuch plus die geänderten Texte aus der Datenbank.
// Übernommen werden nur Schlüssel aus lib/contentFields.ts; "rich"-Texte
// werden zur Sicherheit erneut gefiltert.
export const loadDictionary = cache(async (locale: Locale): Promise<Dictionary> => {
  const base = getDictionary(locale);
  const rows = (await loadSiteContent()).filter((r) => r.locale === locale);
  if (rows.length === 0) return base;

  const dict = structuredClone(base) as unknown as Record<string, unknown>;
  for (const row of rows) {
    const field = CONTENT_FIELDS.get(row.key);
    if (!field || !row.value.trim()) continue;
    const value = field.kind === "rich" ? sanitizeRichHtml(row.value) : row.value;
    setByPath(dict, row.key, value);
  }
  return dict as unknown as Dictionary;
});

// Ein-/Ausblenden von Abschnitten (locale "all"). Standard: sichtbar.
export async function isSectionVisible(key: string): Promise<boolean> {
  if (!CONTENT_TOGGLES.has(key)) return true;
  const row = (await loadSiteContent()).find((r) => r.key === key && r.locale === "all");
  return row ? row.value !== "false" : true;
}

function setByPath(obj: Record<string, unknown>, path: string, value: string) {
  const parts = path.split(".");
  let target = obj;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (!next || typeof next !== "object") return;
    target = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  // Nur vorhandene Texte überschreiben, keine neuen Felder anlegen.
  if (typeof target[last] === "string") {
    target[last] = value;
  }
}
