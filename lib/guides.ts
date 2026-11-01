// Fertige Guide-Seiten (eigenständiges HTML aus dem /video-guide-Skill)
// liegen unter public/guides/<slug>.html. /guides listet sie, und
// /guides/<slug> bettet sie im App-Rahmen ein. Neuer Guide: Datei nach
// public/guides kopieren und hier eintragen.
export interface Guide {
  slug: string;
  title: string;
  topic: string;
  description: string;
  updated: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "berufe",
    title: "Berufe in Forever",
    topic: "Berufe",
    description:
      "Alle 12 Berufe nach der Beta: Änderungen in Forever, Nutzen für deinen Charakter, Gold und passende Kombinationen.",
    updated: "2026-10-31",
  },
  {
    slug: "erste-24-stunden",
    title: "Die ersten 24 Stunden",
    topic: "Gold zum Launch",
    description:
      "Schnell auf Level 10 oder 20, Rohgold mit Angeln und Kochen machen und es ins Auktionshaus stecken.",
    updated: "2026-10-31",
  },
  {
    slug: "zweitaccount",
    title: "Der Zweitaccount",
    topic: "Zweitaccount",
    description:
      "Wofür ein zweiter Account in Forever Zeit spart und wo die Regeln enden.",
    updated: "2026-10-31",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guideFile(slug: string): string {
  return `/guides/${slug}.html`;
}
