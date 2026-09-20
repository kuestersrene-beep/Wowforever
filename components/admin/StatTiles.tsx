import type { SurveyResponse } from "@/lib/types";

export default function StatTiles({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const ja = responses.filter((r) => r.participation === "ja").length;
  const vielleicht = responses.filter(
    (r) => r.participation === "vielleicht"
  ).length;
  const nein = responses.filter((r) => r.participation === "nein").length;

  const tiles = [
    { label: "Ja", value: ja, color: "text-emerald-400" },
    { label: "Vielleicht", value: vielleicht, color: "text-amber-400" },
    { label: "Nein", value: nein, color: "text-red-400" },
    { label: "Gesamt", value: responses.length, color: "text-slate-200" },
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
