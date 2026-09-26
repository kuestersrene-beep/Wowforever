"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { Faction, ParticipantSummary } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";

const COLORS: Record<Faction, string> = {
  horde: "#c41f3b",
  allianz: "#2f6fed",
  egal: "#64748b",
};

export default function FactionChart({
  responses,
  dict,
}: {
  responses: ParticipantSummary[];
  dict: Dictionary;
}) {
  const counts: Record<Faction, number> = { horde: 0, allianz: 0, egal: 0 };
  responses.forEach((r) => {
    if (r.faction === "horde") counts.horde++;
    else if (r.faction === "allianz") counts.allianz++;
    else if (r.faction === "egal") counts.egal++;
  });

  const data = (Object.keys(counts) as Faction[])
    .filter((key) => counts[key] > 0)
    .map((key) => ({ id: key, name: dict.labels.faction[key], value: counts[key] }));

  return (
    <div className="panel p-4">
      <h3 className="mb-2 font-heading text-gold-light">{dict.admin.charts.faction}</h3>
      {data.length === 0 ? (
        <EmptyState dict={dict} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>
              {data.map((entry) => (
                <Cell key={entry.id} fill={COLORS[entry.id]} />
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

export function EmptyState({ dict }: { dict: Dictionary }) {
  return (
    <p className="flex h-[220px] items-center justify-center text-sm text-slate-500">
      {dict.admin.charts.empty}
    </p>
  );
}
