"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, getDisplayName } from "@/lib/admin";
import {
  GOLD_RADAR_BUCKET,
  SCAN_FILE_MAX_BYTES,
  SCAN_SOURCES,
  SCAN_UPLOADS_PER_DAY,
  hasGoldRadarAccess,
  uploadRulesets,
} from "@/lib/goldRadar";

export interface UploadResult {
  ok: boolean;
  message: string;
}

// Nimmt eine SavedVariables-Datei eines AH-Addons (AuctionDB, Auctionator, aux, Tradeskills) eines Mitglieds an.
// Hier wird sie nur grob geprüft und abgelegt; eingelesen wird sie vom
// Dienst gold-radar-worker (Python, liest die Datei nur, führt nichts aus).
export async function uploadScan(_prev: UploadResult | null, formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user ? getDiscordId(user) : null;
  if (!user || !discordId || !(await hasGoldRadarAccess(discordId))) {
    return { ok: false, message: "Kein Zugang." };
  }

  const ruleset = String(formData.get("ruleset") ?? "");
  const file = formData.get("file");
  if (!uploadRulesets().includes(ruleset)) {
    return { ok: false, message: "Unbekanntes Auktionshaus." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Keine Datei ausgewählt." };
  }
  if (file.size > SCAN_FILE_MAX_BYTES) {
    return { ok: false, message: `Datei ist zu groß (max. ${Math.round(SCAN_FILE_MAX_BYTES / 1_048_576)} MB).` };
  }
  // Byte für Byte speichern: Auctionator legt Binärdaten (CBOR) in Lua-Strings ab,
  // die eine Umwandlung in UTF-8-Text zerstören würde.
  const bytes = Buffer.from(await file.arrayBuffer());
  const text = bytes.toString("latin1");
  if (!SCAN_SOURCES.some((s) => text.includes(s.marker))) {
    return {
      ok: false,
      message: `Das ist keine passende Datei. Gesucht ist ${SCAN_SOURCES.map((s) => s.file).join(", ")} aus dem Ordner SavedVariables.`,
    };
  }

  const db = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from("gold_radar_uploads")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .gte("created_at", since);
  if ((count ?? 0) >= SCAN_UPLOADS_PER_DAY) {
    return { ok: false, message: `Höchstens ${SCAN_UPLOADS_PER_DAY} Uploads pro Tag.` };
  }

  const id = randomUUID();
  const path = `uploads/${ruleset}/${id}.lua`;
  const { error: storageError } = await db.storage
    .from(GOLD_RADAR_BUCKET)
    .upload(path, bytes, { contentType: "application/octet-stream" });
  if (storageError) {
    return { ok: false, message: `Hochladen fehlgeschlagen: ${storageError.message}` };
  }
  const { error } = await db.from("gold_radar_uploads").insert({
    id,
    discord_id: discordId,
    display_name: getDisplayName(user),
    ruleset,
    file_path: path,
    size_bytes: file.size,
  });
  if (error) {
    await db.storage.from(GOLD_RADAR_BUCKET).remove([path]);
    return { ok: false, message: `Speichern fehlgeschlagen: ${error.message}` };
  }
  revalidatePath("/gold-radar/upload");
  return { ok: true, message: "Danke! Die Datei wird in den nächsten Minuten eingelesen." };
}
