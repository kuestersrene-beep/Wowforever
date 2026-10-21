import type {
  Daypart,
  Faction,
  Frequency,
  Participation,
  Playstyle,
  Role,
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
