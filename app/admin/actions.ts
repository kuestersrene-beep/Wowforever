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
