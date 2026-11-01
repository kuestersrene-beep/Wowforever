"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import {
  DASHBOARD_FILE,
  GOLD_RADAR_BUCKET,
  MODEL_FILE,
  isGoldRadarOwner,
  isValidRuleset,
} from "@/lib/goldRadar";

const MAX_FILE_BYTES = 9 * 1024 * 1024; // bodySizeLimit in next.config.ts ist 10 MB

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isGoldRadarOwner(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }
}

// Lädt eine neue dashboard-teilen.html (aus ah/dashboard.py --teilen) für
// ein Ruleset hoch und ersetzt die alte.
export async function uploadDashboard(formData: FormData) {
  await requireOwner();

  const ruleset = String(formData.get("ruleset") ?? "").trim();
  const file = formData.get("file");
  if (!isValidRuleset(ruleset)) {
    throw new Error("Ruleset nur aus Kleinbuchstaben, Ziffern und Bindestrichen.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Keine Datei ausgewählt.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Datei ist zu groß (max. 9 MB).");
  }
  const html = await file.text();
  // ältere Dateien heißen noch "Gold-Radar", neue "Blackwater Terminal"
  if (!html.includes("<html") || !["Gold-Radar", "Blackwater Terminal"].some((n) => html.includes(n))) {
    throw new Error("Das sieht nicht nach einer Blackwater-Terminal-HTML-Datei aus.");
  }

  // model.html ist die Vorlage für gold-radar-worker (der baut daraus mit
  // den gemeinsamen Scans dashboard.html neu); dashboard.html sofort
  // ersetzen, damit die neue Version auch ohne laufenden Worker sichtbar ist.
  const storage = createAdminClient().storage.from(GOLD_RADAR_BUCKET);
  for (const name of [MODEL_FILE, DASHBOARD_FILE]) {
    const { error } = await storage.upload(`${ruleset}/${name}`, html, {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });
    if (error) {
      throw new Error(`Hochladen fehlgeschlagen: ${error.message}`);
    }
  }
  revalidatePath("/admin/gold-radar");
}

// Nimmt einen Scan-Upload zurück: der Worker löscht alle Messpunkte, die
// er beigetragen hat, und baut die Tool-Seite neu.
export async function revokeUpload(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    throw new Error("Ungültige Upload-ID.");
  }
  const { error } = await createAdminClient()
    .from("gold_radar_uploads")
    .update({ status: "revoke" })
    .eq("id", id)
    .in("status", ["done", "error", "pending"]);
  if (error) {
    throw new Error(`Zurücknehmen fehlgeschlagen: ${error.message}`);
  }
  revalidatePath("/admin/gold-radar");
}

// Löscht Protokolleinträge, die älter als die angegebene Anzahl Tage sind.
export async function pruneUsage(formData: FormData) {
  await requireOwner();

  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("Ungültige Anzahl Tage.");
  }
  const before = new Date(Date.now() - days * 86_400_000).toISOString();
  const { error } = await createAdminClient()
    .from("gold_radar_usage")
    .delete()
    .lt("created_at", before);
  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }
  revalidatePath("/admin/gold-radar");
}
