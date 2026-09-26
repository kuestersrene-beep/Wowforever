"use client";

import type { SurveyResponse } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function CsvExportButton({
  responses,
  dict,
}: {
  responses: SurveyResponse[];
  dict: Dictionary;
}) {
  const handleExport = () => {
    const t = dict.admin.table;
    const header = [
      t.name,
      "Vorname",
      t.status,
      t.faction,
      t.playstyle,
      `${t.class} (Prio 1)`,
      `${t.class} (Prio 2)`,
      `${t.class} (Prio 3)`,
      t.role,
      t.frequency,
      t.comment,
    ];

    const rows = responses.map((r) => [
      r.display_name,
      r.first_name ?? "",
      dict.labels.participation[r.participation],
      r.faction ? dict.labels.faction[r.faction] : "",
      r.playstyle ? dict.labels.playstyle[r.playstyle] : "",
      r.classes?.[0] ? (dict.labels.class[r.classes[0]] ?? r.classes[0]) : "",
      r.classes?.[1] ? (dict.labels.class[r.classes[1]] ?? r.classes[1]) : "",
      r.classes?.[2] ? (dict.labels.class[r.classes[2]] ?? r.classes[2]) : "",
      r.role ? dict.labels.role[r.role] : "",
      r.frequency ? dict.labels.frequency[r.frequency] : "",
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
      {dict.admin.exportCsv}
    </button>
  );
}
