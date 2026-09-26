export type Participation = "ja" | "vielleicht" | "nein";
export type Faction = "horde" | "allianz" | "egal";
export type Playstyle = "pvp" | "pve" | "beides";
export type Role = "tank" | "heiler" | "dd";
export type Frequency = "gelegentlich" | "mehrmals_woche" | "fast_taeglich";

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
}
