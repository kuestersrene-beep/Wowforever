"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { MAX_REPEAT_WEEKS, ROSTER_SLOTS, SIGNUP_STATUSES } from "@/lib/constants";
import { notifyEventCreated, postRoster } from "@/lib/discord";
import type { EventSignupRow, GuildEvent, RosterSlot, SignupStatus } from "@/lib/types";

function revalidateEvents() {
  revalidatePath("/termine", "layout");
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
  if (!isAdmin(getDiscordId(user))) {
    throw new Error("Nicht berechtigt.");
  }
}

// ---------- Admin: Termine anlegen/löschen ----------

export async function createEvent(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const instance = String(formData.get("instance") ?? "").trim().slice(0, 120) || null;
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  // starts_at kommt bereits als ISO-Strings (UTC) aus dem Browser, einer
  // pro Woche - dort sind Uhrzeit und Zeitumstellung schon berücksichtigt
  // (siehe components/events/EventCreateForm.tsx).
  const startDates = formData
    .getAll("starts_at")
    .slice(0, MAX_REPEAT_WEEKS)
    .map((v) => new Date(String(v)));
  const maxSize = Math.min(40, Math.max(1, Number(formData.get("max_size")) || 40));

  if (
    !title ||
    startDates.length === 0 ||
    startDates.some((d) => Number.isNaN(d.getTime()))
  ) {
    throw new Error("Titel und Beginn sind erforderlich.");
  }

  const repeatWeeks = startDates.length;
  const seriesId = repeatWeeks > 1 ? randomUUID() : null;
  const rows = startDates.map((startsAt) => ({
    series_id: seriesId,
    title,
    instance,
    description,
    starts_at: startsAt.toISOString(),
    max_size: maxSize,
  }));

  // service_role Key nötig, weil "events" für normale Nutzer:innen nur
  // eine select-Policy hat (siehe supabase/schema.sql).
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("events")
    .insert(rows)
    .select("*")
    .order("starts_at", { ascending: true })
    .returns<GuildEvent[]>();

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  if (data?.[0]) {
    await notifyEventCreated(data[0], repeatWeeks);
  }

  revalidateEvents();
}

// Bearbeitet genau einen Termin (auch wenn er zu einer Serie gehört).
// Anmeldungen und Aufstellung bleiben erhalten.
export async function updateEvent(formData: FormData) {
  await requireAdmin();

  const eventId = String(formData.get("event_id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const instance = String(formData.get("instance") ?? "").trim().slice(0, 120) || null;
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  // Wie beim Anlegen: ISO-String aus dem Browser (dessen Zeitzone gilt).
  const startsAt = new Date(String(formData.get("starts_at") ?? ""));
  const maxSize = Math.min(40, Math.max(1, Number(formData.get("max_size")) || 40));

  if (!eventId || !title || Number.isNaN(startsAt.getTime())) {
    throw new Error("Titel und Beginn sind erforderlich.");
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("events")
    .update({
      title,
      instance,
      description,
      starts_at: startsAt.toISOString(),
      max_size: maxSize,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateEvents();
}

export async function deleteEvent(eventId: string, wholeSeries: boolean) {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { data: event } = await adminSupabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<GuildEvent>();

  if (!event) return;

  // Bei einer Serie nur diesen und alle späteren Termine löschen -
  // vergangene Abende bleiben als Historie erhalten.
  const query =
    wholeSeries && event.series_id
      ? adminSupabase
          .from("events")
          .delete()
          .eq("series_id", event.series_id)
          .gte("starts_at", event.starts_at)
      : adminSupabase.from("events").delete().eq("id", eventId);

  const { error } = await query;
  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  revalidateEvents();
}

// ---------- Mitglieder: an-/abmelden ----------

export async function saveSignup(formData: FormData) {
  const { supabase, user } = await requireUser();

  const eventId = String(formData.get("event_id") ?? "");
  const characterId = String(formData.get("character_id") ?? "");
  const status = String(formData.get("status") ?? "") as SignupStatus;
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 200) || null;

  if (!eventId || !characterId || !SIGNUP_STATUSES.includes(status)) {
    throw new Error("Bitte Charakter und Status wählen.");
  }

  // Ob der Charakter wirklich der eigenen Person gehört, prüft die
  // RLS-Policy "insert/update own signup" in der Datenbank.
  const { error } = await supabase.from("event_signups").upsert({
    event_id: eventId,
    user_id: user.id,
    character_id: characterId,
    status,
    comment,
  });

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateEvents();
}

export async function removeSignup(eventId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("event_signups")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  }

  // Auch die eigene Einteilung entfernen, sonst wäre man bei einer
  // erneuten Anmeldung sofort wieder bestätigt. event_roster hat keine
  // Policies, daher service_role - aber nur für die eigene Zeile.
  const adminSupabase = createAdminClient();
  await adminSupabase
    .from("event_roster")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  revalidateEvents();
}

// ---------- Admin: Aufstellung ----------

export async function setRosterSlot(
  eventId: string,
  userId: string,
  slot: RosterSlot | null
) {
  await requireAdmin();

  // service_role Key nötig, weil event_roster bewusst keine Policies hat.
  const adminSupabase = createAdminClient();
  const { error } =
    slot && ROSTER_SLOTS.includes(slot)
      ? await adminSupabase
          .from("event_roster")
          .upsert({ event_id: eventId, user_id: userId, slot })
      : await adminSupabase
          .from("event_roster")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", userId);

  if (error) {
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  revalidateEvents();
}

export async function postRosterToDiscord(eventId: string): Promise<boolean> {
  await requireAdmin();

  const adminSupabase = createAdminClient();
  const { data: event } = await adminSupabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<GuildEvent>();
  if (!event) return false;

  const { data: signups } = await adminSupabase
    .from("event_signups_overview")
    .select("*")
    .eq("event_id", eventId)
    .returns<EventSignupRow[]>();

  return postRoster(event, signups ?? []);
}
