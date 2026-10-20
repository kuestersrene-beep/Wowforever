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
// sind (kein Kommentar, keine Häufigkeit, kein Zeitstempel, keine
// Discord-ID). Charts/Banner, die nur diese Felder brauchen, werden mit
// diesem Typ statt SurveyResponse getippt, damit sie sowohl auf
// /uebersicht (mit dieser eingeschränkten Sicht) als auch im
// Admin-Dashboard (mit vollen SurveyResponse-Daten) funktionieren.
export interface ParticipantSummary {
  user_id: string;
  display_name: string;
  first_name: string | null;
  avatar_url: string | null;
  participation: Participation;
  faction: Faction | null;
  playstyle: Playstyle | null;
  classes: string[] | null;
  role: Role | null;
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
