"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DAYPARTS, WEEKDAYS } from "@/lib/constants";

const VALID_SLOTS = new Set(
  WEEKDAYS.flatMap((day) => DAYPARTS.map((part) => `${day}_${part}`))
);

export async function saveAvailability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const slots = formData
    .getAll("slot")
    .map((v) => String(v))
    .filter((v) => VALID_SLOTS.has(v));

  const { error } = await supabase
    .from("availability")
    .upsert({ user_id: user.id, slots });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/verfuegbarkeit");
  revalidatePath("/uebersicht");
}

export async function clearAvailability() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePath("/verfuegbarkeit");
  revalidatePath("/uebersicht");
}
