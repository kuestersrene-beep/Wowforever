import type { Faction, Frequency, Participation, Playstyle, Role } from "./types";

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
