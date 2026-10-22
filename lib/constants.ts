import type {
  Daypart,
  Faction,
  Frequency,
  Participation,
  Playstyle,
  Role,
  RosterSlot,
  SignupStatus,
  Weekday,
} from "./types";

export const WOW_CLASSES = [
  "Krieger",
  "Paladin",
  "Jäger",
  "Schurke",
  "Priester",
  "Schamane",
  "Magier",
  "Hexenmeister",
  "Druide",
] as const;

export const CLASS_PRIORITY_COUNT = 3;

// Final entschieden: alle spielen Horde auf einem PvP-Reich. Die Umfrage
// fragt das nicht mehr ab, sondern setzt diese Werte fest.
export const FIXED_FACTION: Faction = "horde";
export const FIXED_PLAYSTYLE: Playstyle = "pvp";

export const WOW_PROFESSIONS = [
  "Alchemie",
  "Schmiedekunst",
  "Verzauberkunst",
  "Ingenieurskunst",
  "Kräuterkunde",
  "Lederverarbeitung",
  "Bergbau",
  "Kürschnerei",
  "Schneiderei",
] as const;

export const PROFESSION_PICK_COUNT = 2;

// Die bekannten, offiziellen WoW-Klassenfarben (reine Hex-Werte, kein
// Blizzard-Bildmaterial) - macht Klassen in Textlisten auf einen Blick
// unterscheidbar.
export const CLASS_COLORS: Record<string, string> = {
  Krieger: "#C79C6E",
  Paladin: "#F58CBA",
  Jäger: "#ABD473",
  Schurke: "#FFF569",
  Priester: "#F0EBE0",
  Schamane: "#2459FF",
  Magier: "#69CCF0",
  Hexenmeister: "#9482C9",
  Druide: "#FF7D0A",
};

export const FACTION_COLORS: Record<Faction, string> = {
  horde: "#e0414d",
  allianz: "#4a8fd4",
  egal: "",
};

// Eigene, generische Symbole (Emoji) statt Blizzard-Berufssymbolen -
// nur zur groben Wiedererkennung in der Liste.
export const PROFESSION_ICONS: Record<string, string> = {
  Alchemie: "🧪",
  Schmiedekunst: "🔨",
  Verzauberkunst: "✨",
  Ingenieurskunst: "⚙️",
  Kräuterkunde: "🌿",
  Lederverarbeitung: "🥾",
  Bergbau: "⛏️",
  Kürschnerei: "🔪",
  Schneiderei: "🧵",
};

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const satisfies readonly Weekday[];

export const DAYPARTS = ["morning", "afternoon", "evening", "night"] as const satisfies readonly Daypart[];

export const PARTICIPATION_LABELS: Record<Participation, string> = {
  ja: "Ja",
  vielleicht: "Vielleicht",
  nein: "Nein",
};

export const FACTION_LABELS: Record<Faction, string> = {
  horde: "Horde",
  allianz: "Allianz",
  egal: "Egal",
};

export const PLAYSTYLE_LABELS: Record<Playstyle, string> = {
  pvp: "PvP",
  pve: "PvE",
  beides: "Beides",
};

export const ROLE_LABELS: Record<Role, string> = {
  tank: "Tank",
  heiler: "Heiler",
  dd: "Schadensausteiler (DD)",
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  gelegentlich: "Gelegentlich",
  mehrmals_woche: "Mehrmals pro Woche",
  fast_taeglich: "Fast täglich",
};

export const ROLES = ["tank", "heiler", "dd"] as const satisfies readonly Role[];

export const SIGNUP_STATUSES = ["dabei", "vorlaeufig", "abgemeldet"] as const satisfies readonly SignupStatus[];

export const ROSTER_SLOTS = ["bestaetigt", "bank"] as const satisfies readonly RosterSlot[];

// Instanzen als Vorschläge im Termin-Formular (Freitext bleibt möglich).
export const INSTANCES = [
  "Geschmolzener Kern",
  "Onyxias Hort",
  "Pechschwingenhort",
  "Zul'Gurub",
  "Ruinen von Ahn'Qiraj",
  "Tempel von Ahn'Qiraj",
  "Naxxramas",
] as const;

// Termine werden in dieser Zeitzone angezeigt, unabhängig davon, in
// welcher Zeitzone der Server (z. B. der Docker-Container, meist UTC) läuft.
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Europe/Berlin";

// Wie viele Wochen ein wiederkehrender Termin maximal im Voraus angelegt wird.
export const MAX_REPEAT_WEEKS = 12;

// Logo-Größe in Prozent der jeweiligen Standardgröße (siehe site_settings
// in supabase/schema.sql - die Grenzen dort müssen hierzu passen).
export const LOGO_SCALE_MIN = 100;
export const LOGO_SCALE_MAX = 400;
export const LOGO_SCALE_DEFAULT = 100;
