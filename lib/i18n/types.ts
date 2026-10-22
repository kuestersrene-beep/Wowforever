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
    toCharacters: string;
    toEvents: string;
    toGuildName: string;
    pendingTemplate: string; // Platzhalter: {n}
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
    decisionTag: string;
    decisionTitle: string;
    decisionText: string;
    callTitle: string;
    callText: string;
    professionsTitle: string;
    professionsText: string;
    professionsButton: string;
    availabilityTitle: string;
    availabilityText: string;
    availabilityButton: string;
    farewell: string;
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
    lockedHint: string;
    pleaseChoose: string;
    q4Legend: string;
    q4Hint: string;
    prioNoneTemplate: string; // Platzhalter: {n}
    q5Legend: string;
    q5Hint: string;
    profession1Label: string;
    profession2Label: string;
    professionDuplicateError: string;
    q6Legend: string;
    notSureYet: string;
    q7Legend: string;
    q8Legend: string;
    commentPlaceholder: string;
    saving: string;
    save: string;
    saved: string;
    deleteButton: string;
    deleteConfirm: string;
  };
  overview: {
    title: string;
    participantsTitle: string;
    professionsTitle: string;
    professionsHint: string;
    professionMissing: string;
    analysisTitle: string;
    noResponses: string;
    noteLabel: string;
    availabilityTitle: string;
    availabilityHint: string;
    availabilityHeatmapEmpty: string;
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
  characters: {
    title: string;
    hint: string;
    mine: string;
    noneYet: string;
    roster: string;
    rosterHint: string;
    rosterEmpty: string;
    nameLabel: string;
    classLabel: string;
    roleLabel: string;
    mainLabel: string;
    mainBadge: string;
    addTitle: string;
    editTitle: string;
    prefillHint: string;
    save: string;
    saving: string;
    cancel: string;
    edit: string;
    deleteButton: string;
    deleteConfirm: string;
    countTemplate: string; // Platzhalter: {n}
    countOne: string;
  };
  events: {
    title: string;
    hint: string;
    upcoming: string;
    past: string;
    empty: string;
    detailsLink: string;
    mySignupLabel: string;
    notSignedUp: string;
    signedUpTemplate: string; // Platzhalter: {n} {max}
    roleCountsTemplate: string; // Platzhalter: {tank} {healer} {dd}
    signupTitle: string;
    needCharacter: string;
    characterLabel: string;
    statusLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    signupSave: string;
    signupSaving: string;
    signupRemove: string;
    signupRemoveConfirm: string;
    signupsTitle: string;
    signupsEmpty: string;
    rosterTitle: string;
    rosterEmpty: string;
    benchTitle: string;
    openTitle: string;
    declinedTitle: string;
    admin: {
      createTitle: string;
      titleLabel: string;
      titlePlaceholder: string;
      instanceLabel: string;
      descriptionLabel: string;
      startsAtLabel: string;
      maxSizeLabel: string;
      repeatLabel: string;
      repeatHint: string;
      create: string;
      creating: string;
      edit: string;
      editTitle: string;
      editHint: string;
      saveChanges: string;
      saving: string;
      confirm: string;
      bench: string;
      reset: string;
      postRoster: string;
      postingRoster: string;
      rosterPosted: string;
      rosterPostFailed: string;
      deleteEvent: string;
      deleteEventConfirm: string;
      deleteSeries: string;
      deleteSeriesConfirm: string;
    };
  };
  guildName: {
    title: string;
    hint: string;
    pollTitle: string;
    pollEmpty: string;
    votesTemplate: string; // Platzhalter: {n}
    voteOne: string;
    vote: string;
    yourVote: string;
    removeVote: string;
    suggestedBy: string;
    suggestTitle: string;
    suggestHint: string;
    suggestPlaceholder: string;
    suggest: string;
    suggesting: string;
    suggested: string;
    errorDuplicate: string;
    errorLimitTemplate: string; // Platzhalter: {n}
    errorInvalid: string;
    mineTitle: string;
    withdraw: string;
    withdrawConfirm: string;
    status: { offen: string; freigegeben: string; abgelehnt: string };
    admin: {
      queueTitle: string;
      queueHint: string;
      queueEmpty: string;
      approve: string;
      reject: string;
      delete: string;
      deleteConfirm: string;
      rejectedTitle: string;
    };
  };
  admin: {
    title: string;
    allParticipants: string;
    logo: {
      title: string;
      hint: string;
      urlLabel: string;
      preview: string;
      current: string;
      defaultActive: string;
      save: string;
      saving: string;
      saved: string;
      reset: string;
      resetConfirm: string;
      invalid: string;
      loadError: string;
      sizeLabel: string;
      sizeHint: string;
      sizeSave: string;
      sizeDefault: string;
      saveError: string;
      timerTitle: string;
      timerHint: string;
    };
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
      profession: string;
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
    profession: Record<string, string>;
    weekday: Record<Weekday, string>;
    daypart: Record<Daypart, string>;
    signupStatus: Record<SignupStatus, string>;
    rosterSlot: Record<RosterSlot, string>;
  };
}
