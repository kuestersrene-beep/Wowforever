"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import { isGoldRadarOwner } from "@/lib/goldRadar";

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isGoldRadarOwner(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }
}

// Die Tool-Vorlage (dashboard-teilen.html) lädt die Route ./upload hoch (DashboardUpload.tsx).

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

// Setzt den Status einer Feedback-Meldung (neu, gesehen, erledigt).
export async function setFeedbackStatus(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["neu", "gesehen", "erledigt"].includes(status)) {
    throw new Error("Ungültige Angaben.");
  }
  const { error } = await createAdminClient().from("gold_radar_feedback").update({ status }).eq("id", id);
  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
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
