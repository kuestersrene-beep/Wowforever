import type { SurveyResponse } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";

export default function StatTiles({
  responses,
  dict,
}: {
  responses: SurveyResponse[];
  dict: Dictionary;
}) {
  const ja = responses.filter((r) => r.participation === "ja").length;
  const vielleicht = responses.filter(
    (r) => r.participation === "vielleicht"
  ).length;
  const nein = responses.filter((r) => r.participation === "nein").length;

  const tiles = [
    { label: dict.admin.stat.yes, value: ja, color: "text-emerald-400" },
    { label: dict.admin.stat.maybe, value: vielleicht, color: "text-amber-400" },
    { label: dict.admin.stat.no, value: nein, color: "text-red-400" },
    { label: dict.admin.stat.total, value: responses.length, color: "text-slate-200" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="panel p-4 text-center"
        >
          <p className={`text-3xl font-bold ${t.color}`}>{t.value}</p>
          <p className="text-sm text-slate-400">{t.label}</p>
        </div>
      ))}
    </div>
  );
}
