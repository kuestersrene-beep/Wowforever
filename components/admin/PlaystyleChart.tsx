"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SurveyResponse } from "@/lib/types";
import { EmptyState } from "./FactionChart";

export default function PlaystyleChart({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const counts: Record<string, number> = { PvP: 0, PvE: 0, Beides: 0 };
  responses.forEach((r) => {
    if (r.playstyle === "pvp") counts.PvP++;
    else if (r.playstyle === "pve") counts.PvE++;
    else if (r.playstyle === "beides") counts.Beides++;
  });

  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="panel p-4">
      <h3 className="mb-2 font-heading text-gold-light">Spielstil</h3>
      {!hasData ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis allowDecimals={false} stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
            <Bar dataKey="value" fill="#34d399" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
