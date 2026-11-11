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

// Neuigkeiten (gold_radar_news, gesammelt vom gold-radar-worker) freigeben: getrennt für die Tool-Seite
// (show_page) und für Discord (post_discord; der Worker postet und setzt sent_at). Ohne Freigabe geht nichts raus.
const NEWS_ACTIONS = ["page_on", "page_off", "discord", "dismiss", "reopen"] as const;

export async function setNewsRelease(formData: FormData) {
  await requireOwner();

  const id = Number(formData.get("id"));
  const action = String(formData.get("action") ?? "");
  if (!Number.isInteger(id) || id < 1 || !(NEWS_ACTIONS as readonly string[]).includes(action)) {
    throw new Error("Ungültige Angaben.");
  }
  const now = new Date().toISOString();
  const change: Record<string, unknown> =
    action === "page_on"
      ? { show_page: true, reviewed: true, reviewed_at: now }
      : action === "page_off"
        ? { show_page: false, reviewed: true, reviewed_at: now }
        : action === "discord"
          ? { post_discord: true, reviewed: true, reviewed_at: now }
          : action === "dismiss"
            ? { show_page: false, post_discord: false, reviewed: true, reviewed_at: now }
            : { reviewed: false, reviewed_at: null };
  // „verwerfen“ nimmt eine Meldung von der Seite; was schon in Discord steht, bleibt dort (sent_at)
  const { error } = await createAdminClient().from("gold_radar_news").update(change).eq("id", id);
  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }
  revalidatePath("/admin/gold-radar");
}
