"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";

export async function setAdminNote(userId: string, note: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }

  const trimmed = note.trim().slice(0, 500);

  // service_role Key noetig, weil admin_notes bewusst keine RLS-Policy
  // fuer normale Nutzer:innen hat (siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("admin_notes")
    .upsert({ user_id: userId, note: trimmed || null });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/uebersicht");
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }
}

export async function addDownload(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const url = String(formData.get("url") ?? "").trim();
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;

  if (!title || !url) {
    throw new Error("Titel und Download-Link sind erforderlich.");
  }

  // service_role Key noetig, weil "downloads" fuer normale Nutzer:innen
  // nur eine select-Policy hat (siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("downloads").insert({
    title,
    description,
    url,
    image_url: imageUrl,
  });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/downloads");
}

export async function deleteDownload(id: string) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("downloads").delete().eq("id", id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/downloads");
}
