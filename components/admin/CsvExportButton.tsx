"use client";

import type { SurveyResponse } from "@/lib/types";
import {
  FACTION_LABELS,
  FREQUENCY_LABELS,
  PARTICIPATION_LABELS,
  PLAYSTYLE_LABELS,
  ROLE_LABELS,
} from "@/lib/constants";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function CsvExportButton({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const handleExport = () => {
    const header = [
      "Name",
      "Vorname",
      "Status",
      "Fraktion",
      "Spielstil",
      "Klasse (Prio 1)",
      "Klasse (Prio 2)",
      "Klasse (Prio 3)",
      "Rolle",
      "Häufigkeit",
      "Kommentar",
    ];

    const rows = responses.map((r) => [
      r.display_name,
      r.first_name ?? "",
      PARTICIPATION_LABELS[r.participation],
      r.faction ? FACTION_LABELS[r.faction] : "",
      r.playstyle ? PLAYSTYLE_LABELS[r.playstyle] : "",
      r.classes?.[0] ?? "",
      r.classes?.[1] ?? "",
      r.classes?.[2] ?? "",
      r.role ? ROLE_LABELS[r.role] : "",
      r.frequency ? FREQUENCY_LABELS[r.frequency] : "",
      r.comment ?? "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
      .join("\n");

    // BOM sorgt dafür, dass Umlaute in Excel korrekt angezeigt werden.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wow-forever-umfrage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="rounded-lg border border-gold/30 px-3 py-1.5 text-sm text-parchment transition hover:bg-gold/10"
    >
      Als CSV exportieren
    </button>
  );
}
