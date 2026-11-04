import type { Dictionary } from "@/lib/i18n/types";

// Platzhalter für Diagramme ohne Daten (gleiche Höhe wie ein Diagramm)
export function EmptyState({ dict }: { dict: Dictionary }) {
  return (
    <p className="flex h-[220px] items-center justify-center text-sm text-slate-500">
      {dict.admin.charts.empty}
    </p>
  );
}
