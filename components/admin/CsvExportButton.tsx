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
      "Klasse",
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
      r.class ?? "",
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
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800"
    >
      Als CSV exportieren
    </button>
  );
}
