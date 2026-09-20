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
  class: string | null;
  role: Role | null;
  frequency: Frequency | null;
  comment: string | null;
  updated_at: string;
}

export type SurveyResponseInput = Omit<SurveyResponse, "updated_at">;
