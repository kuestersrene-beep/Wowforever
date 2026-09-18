"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { SurveyResponse } from "@/lib/types";

const COLORS: Record<string, string> = {
  Horde: "#c41f3b",
  Allianz: "#2f6fed",
  Egal: "#64748b",
};

export default function FactionChart({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const counts: Record<string, number> = { Horde: 0, Allianz: 0, Egal: 0 };
  responses.forEach((r) => {
    if (r.faction === "horde") counts.Horde++;
    else if (r.faction === "allianz") counts.Allianz++;
    else if (r.faction === "egal") counts.Egal++;
  });

  const data = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-2 font-semibold">Fraktion</h3>
      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function EmptyState() {
  return (
    <p className="flex h-[220px] items-center justify-center text-sm text-slate-500">
      Noch keine Daten
    </p>
  );
}
