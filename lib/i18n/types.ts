import type {
  Daypart,
  Faction,
  Frequency,
  Participation,
  Playstyle,
  Role,
  Weekday,
} from "@/lib/types";

export type Locale = "de" | "en";

// Nur reine Daten (Strings/verschachtelte String-Records) - keine
// Funktionen! Dieses Objekt wird als Prop/Context-Wert über die
// Server->Client-Grenze gereicht, und React Server Components können
// keine Funktionen darüber serialisieren. Dynamische Texte (mit Zahlen
// etc.) werden über Platzhalter-Templates + separate reine
// Formatierungsfunktionen in lib/i18n/format.ts gelöst.
export interface Dictionary {
  nav: {
    back: string;
    toSurvey: string;
    toOverview: string;
    toAdmin: string;
    toAvailability: string;
    toDownloads: string;
    loggedInAs: string;
    loginPrompt: string;
  };
  login: {
    withDiscord: string;
  };
  logout: {
    label: string;
  };
  home: {
    subtitle: string;
    quest: string;
    privacyTitle: string;
    privacyText: string;
    countdownLabels: {
      days: string;
      hours: string;
      minutes: string;
      seconds: string;
    };
    countdownToday: string;
  };
  survey: {
    title: string;
    backHint: string;
    deadlineTemplate: string; // Platzhalter: {date}
    firstNameLabel: string;
    firstNameHint: string;
    firstNamePlaceholder: string;
    q1Legend: string;
    q2Legend: string;
    q2Hint: string;
    q3Legend: string;
    q3Hint: string;
    pleaseChoose: string;
    q4Legend: string;
    q4Hint: string;
    prioNoneTemplate: string; // Platzhalter: {n}
    q5Legend: string;
    notSureYet: string;
    q6Legend: string;
    q7Legend: string;
    commentPlaceholder: string;
    saving: string;
    save: string;
    saved: string;
    deleteButton: string;
    deleteConfirm: string;
  };
  overview: {
    title: string;
    memeCaption: string;
    memeAlt: string;
    noResponses: string;
    noteLabel: string;
    availabilityTitle: string;
    availabilityHint: string;
    availabilityHeatmapEmpty: string;
    availabilityListEmpty: string;
  };
  availability: {
    title: string;
    hint: string;
    backHint: string;
    noSlotsHint: string;
    save: string;
    saving: string;
    saved: string;
    clearButton: string;
    clearConfirm: string;
  };
  downloads: {
    title: string;
    hint: string;
    empty: string;
    downloadButton: string;
    admin: {
      addTitle: string;
      titleLabel: string;
      descriptionLabel: string;
      urlLabel: string;
      imageUrlLabel: string;
      imageUrlHint: string;
      addButton: string;
      adding: string;
      deleteButton: string;
      deleteConfirm: string;
    };
  };
  admin: {
    title: string;
    allParticipants: string;
    loadErrorTemplate: string; // Platzhalter: {msg}
    exportCsv: string;
    filterLabel: string;
    filterAll: string;
    table: {
      name: string;
      status: string;
      faction: string;
      playstyle: string;
      class: string;
      role: string;
      frequency: string;
      comment: string;
      updated: string;
      empty: string;
      adminNote: string;
      adminNotePlaceholder: string;
    };
    stat: { yes: string; maybe: string; no: string; total: string };
    insightTemplate: string; // Platzhalter: {count} {total} {leader}
    roleNeed: {
      summaryTemplate: string; // Platzhalter: {tank} {tankUnit} {healer} {healerUnit} {dd}
      missingTemplate: string; // Platzhalter: {roles}
      tankUnitSingular: string;
      tankUnitPlural: string;
      healerUnitSingular: string;
      healerUnitPlural: string;
      tanks: string;
      healers: string;
    };
    classPriority: {
      title: string;
      hint: string;
      conflictTemplate: string; // Platzhalter: {n}
      prioTemplate: string; // Platzhalter: {n}
    };
    charts: {
      faction: string;
      playstyle: string;
      classes: string;
      roles: string;
      empty: string;
    };
  };
  labels: {
    participation: Record<Participation, string>;
    faction: Record<Faction, string>;
    playstyle: Record<Playstyle, string>;
    role: Record<Role, string>;
    frequency: Record<Frequency, string>;
    class: Record<string, string>;
    weekday: Record<Weekday, string>;
    daypart: Record<Daypart, string>;
  };
}
