import { APP_TIME_ZONE } from "@/lib/constants";
import type { Dictionary, Locale } from "./types";

// Reine Hilfsfunktionen für Texte mit eingesetzten Werten (Zahlen, Namen
// usw.). Bewusst getrennt vom Dictionary-Objekt, weil Funktionen nicht
// über die Server->Client-Grenze als Prop/Context-Wert gereicht werden
// können - der Code hier wird stattdessen direkt in jeder Komponente
// importiert, egal ob Server oder Client Component.

export function formatDeadline(dict: Dictionary, date: string): string {
  return dict.survey.deadlineTemplate.replace("{date}", date);
}

export function formatPrioNone(dict: Dictionary, n: number): string {
  return dict.survey.prioNoneTemplate.replace("{n}", String(n));
}

export function formatLoadError(dict: Dictionary, msg: string): string {
  return dict.admin.loadErrorTemplate.replace("{msg}", msg);
}

export function formatInsight(
  dict: Dictionary,
  count: number,
  total: number,
  leader: string
): string {
  return dict.admin.insightTemplate
    .replace("{count}", String(count))
    .replace("{total}", String(total))
    .replace("{leader}", leader);
}

export function formatRoleSummary(
  dict: Dictionary,
  tank: number,
  healer: number,
  dd: number
): string {
  const tankUnit =
    tank === 1
      ? dict.admin.roleNeed.tankUnitSingular
      : dict.admin.roleNeed.tankUnitPlural;
  const healerUnit =
    healer === 1
      ? dict.admin.roleNeed.healerUnitSingular
      : dict.admin.roleNeed.healerUnitPlural;
  return dict.admin.roleNeed.summaryTemplate
    .replace("{tank}", String(tank))
    .replace("{tankUnit}", tankUnit)
    .replace("{healer}", String(healer))
    .replace("{healerUnit}", healerUnit)
    .replace("{dd}", String(dd));
}

export function formatRoleMissing(dict: Dictionary, roles: string): string {
  return dict.admin.roleNeed.missingTemplate.replace("{roles}", roles);
}

export function formatClassConflict(dict: Dictionary, n: number): string {
  return dict.admin.classPriority.conflictTemplate.replace("{n}", String(n));
}

export function formatPrio(dict: Dictionary, n: number): string {
  return dict.admin.classPriority.prioTemplate.replace("{n}", String(n));
}

export function formatCharacterCount(dict: Dictionary, n: number): string {
  return dict.characters.countTemplate.replace("{n}", String(n));
}

export function formatSignedUp(dict: Dictionary, n: number, max: number): string {
  return dict.events.signedUpTemplate
    .replace("{n}", String(n))
    .replace("{max}", String(max));
}

export function formatRoleCounts(
  dict: Dictionary,
  tank: number,
  healer: number,
  dd: number
): string {
  return dict.events.roleCountsTemplate
    .replace("{tank}", String(tank))
    .replace("{healer}", String(healer))
    .replace("{dd}", String(dd));
}

// Datum/Uhrzeit eines Termins, immer in APP_TIME_ZONE (nicht in der
// Zeitzone des Servers).
export function formatEventDate(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));
}
