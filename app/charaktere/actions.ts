"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrl, getDiscordId, getDisplayName } from "@/lib/admin";
import { ROLES, WOW_CLASSES } from "@/lib/constants";
import type { Role } from "@/lib/types";

const VALID_CLASSES = new Set<string>(WOW_CLASSES);
const VALID_ROLES = new Set<string>(ROLES);

function revalidateAll() {
  revalidatePath("/charaktere");
  revalidatePath("/termine", "layout");
}

export async function saveCharacter(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim().slice(0, 24);
  const charClass = String(formData.get("class") ?? "");
  const role = String(formData.get("role") ?? "");
  const isMain = formData.get("is_main") === "on";

  if (name.length < 2 || !VALID_CLASSES.has(charClass) || !VALID_ROLES.has(role)) {
    throw new Error("Bitte Name, Klasse und Rolle angeben.");
  }

  // Es darf nur einen Main pro Person geben (Unique-Index in
  // supabase/schema.sql) - daher zuerst den bisherigen Main zurücksetzen.
  if (isMain) {
    const { error } = await supabase
      .from("characters")
      .update({ is_main: false })
      .eq("user_id", user.id)
      .eq("is_main", true);
    if (error) {
      throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }

  const payload = {
    user_id: user.id,
    discord_id: getDiscordId(user),
    display_name: getDisplayName(user),
    avatar_url: getAvatarUrl(user),
    name,
    class: charClass,
    role: role as Role,
    is_main: isMain,
  };

  const { error } = id
    ? await supabase
        .from("characters")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("characters").insert(payload);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateAll();
}

export async function deleteCharacter(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidateAll();
}
