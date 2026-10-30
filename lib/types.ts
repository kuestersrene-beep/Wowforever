export type Participation = "ja" | "vielleicht" | "nein";
export type Faction = "horde" | "allianz" | "egal";
export type Playstyle = "pvp" | "pve" | "beides";
export type Role = "tank" | "heiler" | "dd";
export type Frequency = "gelegentlich" | "mehrmals_woche" | "fast_taeglich";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type Daypart = "morning" | "afternoon" | "evening" | "night";

export interface SurveyResponse {
  user_id: string;
  discord_id: string;
  display_name: string;
  first_name: string;
  avatar_url: string | null;
  participation: Participation;
  faction: Faction | null;
  playstyle: Playstyle | null;
  classes: string[] | null;
  role: Role | null;
  professions: string[] | null;
  frequency: Frequency | null;
  comment: string | null;
  updated_at: string;
}

export type SurveyResponseInput = Omit<SurveyResponse, "updated_at">;

// SurveyResponse plus die Admin-Notiz (liegt in einer eigenen Tabelle,
// siehe supabase/schema.sql). Wird im Admin-Dashboard verwendet, wo
// beide Datenquellen serverseitig zusammengeführt werden.
export interface AdminResponseRow extends SurveyResponse {
  admin_note: string | null;
}

// Reduzierter Ausschnitt einer Antwort - die Felder, die über die
// participants_overview-View für ALLE eingeloggten Nutzer:innen sichtbar
// sind (kein Kommentar, keine Häufigkeit, kein Zeitstempel). Charts/
// Banner, die nur diese Felder brauchen, werden mit diesem Typ statt
// SurveyResponse getippt, damit sie sowohl auf /uebersicht (mit dieser
// eingeschränkten Sicht) als auch im Admin-Dashboard (mit vollen
// SurveyResponse-Daten) funktionieren. discord_id ist bewusst mit drin
// (anders als früher) - alle Teilnehmer:innen sind ohnehin per Discord
// eingeloggt und sehen sich gegenseitig, die ID wird für den
// Discord-Icon-Link ("Nachricht schreiben") auf /uebersicht gebraucht.
export interface ParticipantSummary {
  user_id: string;
  discord_id: string;
  display_name: string;
  first_name: string | null;
  avatar_url: string | null;
  participation: Participation;
  faction: Faction | null;
  playstyle: Playstyle | null;
  classes: string[] | null;
  role: Role | null;
  professions: string[] | null;
  admin_note: string | null;
}

// Eine Zeile pro Nutzer:in mit ihren/seinen groben Zeitfenstern
// ("mon_evening", "sat_afternoon", ...). Siehe supabase/schema.sql.
export interface Availability {
  user_id: string;
  slots: string[];
  updated_at: string;
}

// Für die Überschneidungs-Ansicht auf /uebersicht: Availability plus
// Anzeige-Infos aus "responses" (über die availability_overview-View).
export interface AvailabilitySummary {
  user_id: string;
  slots: string[];
  discord_id: string | null;
  first_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// Ein Eintrag im Downloads-Bereich. Nur Admins legen/ändern/löschen
// Einträge (service_role, siehe app/admin/actions.ts) - alle
// eingeloggten Nutzer:innen dürfen sie lesen.
export interface DownloadItem {
  id: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}

// Ein Charakter im Gilden-Roster. Für WoW Forever gibt es keine
// Armory, daher von Hand gepflegt (siehe supabase/schema.sql).
export interface Character {
  id: string;
  user_id: string;
  discord_id: string;
  display_name: string;
  avatar_url: string | null;
  name: string;
  class: string;
  role: Role;
  level: number;
  is_main: boolean;
  created_at: string;
  updated_at: string;
}

export type SignupStatus = "dabei" | "vorlaeufig" | "abgemeldet";
export type RosterSlot = "bestaetigt" | "bank";

// Ein Termin (Raid, Dungeon-Abend, ...). Wiederkehrende Termine teilen
// sich eine series_id.
export interface GuildEvent {
  id: string;
  series_id: string | null;
  title: string;
  instance: string | null;
  description: string | null;
  starts_at: string;
  max_size: number;
  created_at: string;
  // Vom Discord-Bot gepflegt (discord-setup/raid.py).
  discord_channel_id?: string | null;
  discord_message_id?: string | null;
  reminder_sent?: boolean;
  signups_closed?: boolean;
}

// Eine Anmeldung inkl. Charakter und Aufstellungs-Status (über die
// event_signups_overview-View). source "web": Anmeldung über die Website
// bzw. per Discord mit einem Website-Charakter; source "discord":
// Anmeldung nur über Discord, ohne Konto auf der Website - dann gibt es
// keine user_id und keinen Charakter, und bei "abgemeldet" fehlen
// eventuell Klasse und Rolle.
export interface EventSignupRow {
  event_id: string;
  user_id: string | null;
  status: SignupStatus;
  comment: string | null;
  updated_at: string;
  character_id: string | null;
  character_name: string;
  class: string | null;
  role: Role | null;
  level: number;
  discord_id: string;
  display_name: string;
  avatar_url: string | null;
  roster_slot: RosterSlot | null;
  source: "web" | "discord";
}

export type GuildNameStatus = "offen" | "freigegeben" | "abgelehnt";

// Ein Vorschlag für den Gildennamen (siehe guild_name_suggestions in
// supabase/schema.sql).
export interface GuildNameSuggestion {
  id: string;
  name: string;
  user_id: string;
  display_name: string;
  status: GuildNameStatus;
  created_at: string;
}

// Ergebnis eines Namensvorschlags. Rückgabe statt Exception, damit das
// Formular eine verständliche Meldung anzeigen kann.
export type SuggestResult =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "limit" | "invalid" };

// Kurzabstimmung auf der Startseite (siehe quick_polls in
// supabase/schema.sql), aufbereitet mit Stimmen je Antwort.
export interface QuickPollOptionResult {
  id: string;
  label: string;
  votes: number;
}

export interface QuickPollResult {
  id: string;
  question: string;
  active: boolean;
  created_at: string;
  options: QuickPollOptionResult[];
  totalVotes: number;
  // Antwort der eingeloggten Person, null = noch nicht abgestimmt.
  myVote: string | null;
}

export interface CoreFigure {
  icon: string;
  label: string;
}

// Ein Gildenentwurf ("/fraktionen") - konkurrierendes Lore-/Fraktions-
// Konzept. Nur Admins legen an/ändern/aktivieren (siehe
// app/fraktionen/actions.ts und supabase/schema.sql).
export interface GuildDraft {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  summary: string | null;
  lore_html: string | null;
  rank_structure_html: string | null;
  tooltip_title: string | null;
  tooltip_meta: string | null;
  tooltip_effects: string | null;
  tooltip_quote: string | null;
  image_url: string | null;
  crest_url: string | null;
  tabard_url: string | null;
  banner_url: string | null;
  core_figures: CoreFigure[];
  sitz: string | null;
  anfuehrer: string | null;
  feinde: string | null;
  primaerwert: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
