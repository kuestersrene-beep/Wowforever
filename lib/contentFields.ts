// Welche Texte im Admin-Dashboard ("Texte bearbeiten") geändert werden
// können. Jeder Schlüssel entspricht einem Pfad im Wörterbuch
// (lib/i18n/types.ts), z. B. "home.decisionTitle". Nur Schlüssel aus
// dieser Liste werden aus der Datenbank übernommen - weitere Texte lassen
// sich einfach hier ergänzen.
//
// kind "text": einzeiliger Text ohne Formatierung.
// kind "rich": längerer Text mit Editor (fett, kursiv, Links, Listen).
// Wo ein "rich"-Text angezeigt wird, muss er mit <RichText> gerendert
// werden (components/RichText.tsx).

export type ContentKind = "text" | "rich";

export interface ContentField {
  key: string;
  kind: ContentKind;
  label: string;
}

export interface ContentToggle {
  key: string;
  label: string;
}

export interface ContentGroup {
  id: string;
  title: string;
  toggles?: ContentToggle[];
  fields: ContentField[];
}

export const CONTENT_GROUPS: ContentGroup[] = [
  {
    id: "home",
    title: "Startseite",
    toggles: [
      { key: "home.show.decision", label: "Ankündigung (rotes Panel) anzeigen" },
      { key: "home.show.countdown", label: "Countdown im Panel anzeigen" },
      { key: "home.show.call", label: "Aufruf mit Berufe-/Verfügbarkeits-Karten anzeigen" },
      { key: "home.show.privacy", label: "Datenschutz-Hinweis anzeigen" },
    ],
    fields: [
      { key: "home.decisionTag", kind: "text", label: "Ankündigung: Plakette" },
      { key: "home.decisionTitle", kind: "text", label: "Ankündigung: Überschrift" },
      { key: "home.decisionText", kind: "rich", label: "Ankündigung: Text" },
      { key: "home.countdownToday", kind: "text", label: "Countdown: Text am Starttag" },
      { key: "home.callTitle", kind: "text", label: "Aufruf: Überschrift" },
      { key: "home.callText", kind: "rich", label: "Aufruf: Text" },
      { key: "home.professionsTitle", kind: "text", label: "Karte Berufe: Überschrift" },
      { key: "home.professionsText", kind: "rich", label: "Karte Berufe: Text" },
      { key: "home.professionsButton", kind: "text", label: "Karte Berufe: Button" },
      { key: "home.availabilityTitle", kind: "text", label: "Karte Verfügbarkeit: Überschrift" },
      { key: "home.availabilityText", kind: "rich", label: "Karte Verfügbarkeit: Text" },
      { key: "home.availabilityButton", kind: "text", label: "Karte Verfügbarkeit: Button" },
      { key: "nav.loginPrompt", kind: "text", label: "Hinweis für nicht angemeldete Besucher" },
      { key: "home.privacyTitle", kind: "text", label: "Datenschutz: Überschrift" },
      { key: "home.privacyText", kind: "rich", label: "Datenschutz: Text" },
    ],
  },
  {
    id: "survey",
    title: "Umfrage",
    fields: [
      { key: "survey.title", kind: "text", label: "Überschrift" },
      { key: "survey.backHint", kind: "rich", label: "Hinweis oben" },
    ],
  },
  {
    id: "availability",
    title: "Verfügbarkeit",
    fields: [
      { key: "availability.title", kind: "text", label: "Überschrift" },
      { key: "availability.hint", kind: "rich", label: "Hinweis (Kasten)" },
      { key: "availability.backHint", kind: "rich", label: "Hinweis darunter" },
    ],
  },
  {
    id: "overview",
    title: "Übersicht",
    fields: [
      { key: "overview.title", kind: "text", label: "Überschrift" },
      { key: "overview.availabilityHint", kind: "text", label: "Verfügbarkeit: Hinweis" },
      { key: "overview.professionsTitle", kind: "text", label: "Berufe: Überschrift" },
      { key: "overview.professionsHint", kind: "text", label: "Berufe: Hinweis" },
      { key: "overview.participantsTitle", kind: "text", label: "Teilnehmende: Überschrift" },
    ],
  },
  {
    id: "events",
    title: "Termine & Raids",
    fields: [
      { key: "events.title", kind: "text", label: "Überschrift" },
      { key: "events.hint", kind: "rich", label: "Hinweis (Kasten)" },
    ],
  },
  {
    id: "characters",
    title: "Charaktere",
    fields: [
      { key: "characters.title", kind: "text", label: "Überschrift" },
      { key: "characters.hint", kind: "rich", label: "Hinweis (Kasten)" },
    ],
  },
  {
    id: "guildName",
    title: "Gildenname-Umfrage",
    toggles: [
      {
        key: "guildName.show",
        label: "Für Mitglieder sichtbar (Admins sehen die Umfrage immer)",
      },
    ],
    fields: [
      { key: "guildName.title", kind: "text", label: "Überschrift" },
      { key: "guildName.hint", kind: "rich", label: "Hinweis (Kasten)" },
      { key: "guildName.suggestHint", kind: "text", label: "Hinweis beim Vorschlagen" },
    ],
  },
  {
    id: "guildDrafts",
    title: "Fraktionen (Gildenentwürfe)",
    toggles: [
      { key: "guildDrafts.show", label: "Für Mitglieder sichtbar (Admins sehen die Seite immer)" },
    ],
    fields: [
      { key: "guildDrafts.title", kind: "text", label: "Überschrift" },
      { key: "guildDrafts.hint", kind: "rich", label: "Hinweis (Kasten)" },
    ],
  },
  {
    id: "downloads",
    title: "Downloads",
    fields: [
      { key: "downloads.title", kind: "text", label: "Überschrift" },
      { key: "downloads.hint", kind: "rich", label: "Hinweis" },
    ],
  },
];

export const CONTENT_FIELDS: Map<string, ContentField> = new Map(
  CONTENT_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f])
);

export const CONTENT_TOGGLES: Set<string> = new Set(
  CONTENT_GROUPS.flatMap((g) => g.toggles ?? []).map((t) => t.key)
);

// Liest einen Text aus einem verschachtelten Objekt per Pfad ("a.b.c").
export function getByPath(obj: unknown, path: string): string | undefined {
  const value = path
    .split(".")
    .reduce<unknown>((o, part) => (o && typeof o === "object" ? (o as Record<string, unknown>)[part] : undefined), obj);
  return typeof value === "string" ? value : undefined;
}

// Wandelt einen eingebauten Klartext (Absätze mit Leerzeile getrennt) in
// HTML für den Editor um.
export function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n\n")
    .map((p) => `<p>${escape(p)}</p>`)
    .join("");
}
