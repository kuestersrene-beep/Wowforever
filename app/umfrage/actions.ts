"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrl, getDiscordId, getDisplayName } from "@/lib/admin";
import { CLASS_PRIORITY_COUNT } from "@/lib/constants";
import { notifyDiscord } from "@/lib/discord";
import type { Faction, Participation, Playstyle, Role } from "@/lib/types";

export async function saveResponse(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { data: existingRow } = await supabase
    .from("responses")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isUpdate = !!existingRow;

  const participation = formData.get("participation") as Participation;
  const firstName = String(formData.get("first_name") ?? "").trim().slice(0, 100);

  const payload: Record<string, unknown> = {
    user_id: user.id,
    discord_id: getDiscordId(user),
    display_name: getDisplayName(user),
    first_name: firstName || null,
    avatar_url: getAvatarUrl(user),
    participation,
    faction: null,
    playstyle: null,
    classes: null,
    role: null,
    frequency: null,
    comment: null,
  };

  // Nur wenn die Person mitspielen möchte (ja/vielleicht), interessieren
  // uns die restlichen Antworten.
  if (participation !== "nein") {
    payload.faction = formData.get("faction") || null;
    payload.playstyle = formData.get("playstyle") || null;

    // Bis zu CLASS_PRIORITY_COUNT Klassen in Prioritäts-Reihenfolge.
    // Doppelte Auswahl derselben Klasse wird entfernt (die erste, also
    // höchste Priorität, gewinnt).
    const rawClasses = Array.from({ length: CLASS_PRIORITY_COUNT }, (_, i) =>
      String(formData.get(`class_prio_${i + 1}`) ?? "").trim()
    ).filter(Boolean);
    const classes = Array.from(new Set(rawClasses));
    payload.classes = classes.length > 0 ? classes : null;

    payload.role = formData.get("role") || null;
    payload.frequency = formData.get("frequency") || null;
    const comment = formData.get("comment");
    payload.comment = comment ? String(comment).slice(0, 1000) : null;
  }

  const { error } = await supabase.from("responses").upsert(payload);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  const displayName = getDisplayName(user);
  await notifyDiscord({
    name: firstName ? `${displayName} (${firstName})` : displayName,
    avatarUrl: getAvatarUrl(user),
    isUpdate,
    participation,
    faction: payload.faction as Faction | null,
    playstyle: payload.playstyle as Playstyle | null,
    classes: payload.classes as string[] | null,
    role: payload.role as Role | null,
  });

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
