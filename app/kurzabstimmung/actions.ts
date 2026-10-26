"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { QUICK_POLL_MAX_OPTIONS, QUICK_POLL_MIN_OPTIONS } from "@/lib/constants";

function revalidatePolls() {
  revalidatePath("/");
  revalidatePath("/admin");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht angemeldet.");
  }
  return { supabase, user };
}

async function requireAdmin() {
  const { user } = await requireUser();
  if (!(await isAdmin(getDiscordId(user)))) {
    throw new Error("Nicht berechtigt.");
  }
}

// ---------- Mitglieder: abstimmen ----------

export async function voteQuickPoll(pollId: string, optionId: string) {
  const { supabase, user } = await requireUser();

  // Eine Stimme pro Person und Abstimmung - eine neue Wahl ersetzt die
  // alte. Ob die Abstimmung aktiv ist und die Antwort dazugehört, prüft
  // die RLS-Policy.
  const { error } = await supabase
    .from("quick_poll_votes")
    .upsert({ poll_id: pollId, user_id: user.id, option_id: optionId });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePolls();
}

export async function removeQuickPollVote(pollId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("quick_poll_votes")
    .delete()
    .eq("poll_id", pollId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePolls();
}

// ---------- Admin: anlegen, (de)aktivieren, löschen ----------

export async function createQuickPoll(formData: FormData) {
  await requireAdmin();

  const question = String(formData.get("question") ?? "").trim().slice(0, 300);
  // Eine Antwort pro Zeile, leere Zeilen und Doppelte werden ignoriert.
  const labels = Array.from(
    new Set(
      String(formData.get("options") ?? "")
        .split("\n")
        .map((l) => l.trim().slice(0, 100))
        .filter(Boolean)
    )
  );
  const active = formData.get("active") === "on";

  if (
    question.length < 3 ||
    labels.length < QUICK_POLL_MIN_OPTIONS ||
    labels.length > QUICK_POLL_MAX_OPTIONS
  ) {
    throw new Error("Bitte eine Frage und 2 bis 6 Antworten angeben.");
  }

  // service_role Key nötig: quick_polls hat für normale Nutzer:innen nur
  // eine select-Policy (siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  const { data: poll, error } = await adminSupabase
    .from("quick_polls")
    .insert({ question, active })
    .select("id")
    .single<{ id: string }>();

  if (error || !poll) {
    throw new Error(`Speichern fehlgeschlagen: ${error?.message}`);
  }

  const { error: optionsError } = await adminSupabase.from("quick_poll_options").insert(
    labels.map((label, i) => ({ poll_id: poll.id, label, sort_order: i }))
  );

  if (optionsError) {
    // Ohne Antworten ist die Abstimmung nutzlos - wieder entfernen.
    await adminSupabase.from("quick_polls").delete().eq("id", poll.id);
    throw new Error(`Speichern fehlgeschlagen: ${optionsError.message}`);
  }

  revalidatePolls();
}

export async function setQuickPollActive(pollId: string, active: boolean) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("quick_polls")
    .update({ active })
    .eq("id", pollId);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidatePolls();
}

export async function deleteQuickPoll(pollId: string) {
  await requireAdmin();

  // Antworten und Stimmen werden per "on delete cascade" mit entfernt.
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("quick_polls").delete().eq("id", pollId);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidatePolls();
}
