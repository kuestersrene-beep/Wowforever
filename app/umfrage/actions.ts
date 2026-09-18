"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrl, getDiscordId, getDisplayName } from "@/lib/admin";

export async function saveResponse(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const participation = formData.get("participation") as string;

  const payload: Record<string, unknown> = {
    user_id: user.id,
    discord_id: getDiscordId(user),
    display_name: getDisplayName(user),
    avatar_url: getAvatarUrl(user),
    participation,
    faction: null,
    playstyle: null,
    class: null,
    role: null,
    frequency: null,
    comment: null,
  };

  // Nur wenn die Person mitspielen möchte (ja/vielleicht), interessieren
  // uns die restlichen Antworten.
  if (participation !== "nein") {
    payload.faction = formData.get("faction") || null;
    payload.playstyle = formData.get("playstyle") || null;
    payload.class = formData.get("class") || null;
    payload.role = formData.get("role") || null;
    payload.frequency = formData.get("frequency") || null;
    const comment = formData.get("comment");
    payload.comment = comment ? String(comment).slice(0, 1000) : null;
  }

  const { error } = await supabase.from("responses").upsert(payload);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/umfrage");
  revalidatePath("/uebersicht");
  revalidatePath("/admin");
}

export async function deleteResponse() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { error } = await supabase.from("responses").delete().eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/umfrage");
  revalidatePath("/uebersicht");
  revalidatePath("/admin");
}
