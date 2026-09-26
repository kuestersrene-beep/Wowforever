"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Playstyle, SurveyResponse } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import { EmptyState } from "./FactionChart";

export default function PlaystyleChart({
  responses,
  dict,
}: {
  responses: SurveyResponse[];
  dict: Dictionary;
}) {
  const counts: Record<Playstyle, number> = { pvp: 0, pve: 0, beides: 0 };
  responses.forEach((r) => {
    if (r.playstyle === "pvp") counts.pvp++;
    else if (r.playstyle === "pve") counts.pve++;
    else if (r.playstyle === "beides") counts.beides++;
  });

  const data = (Object.keys(counts) as Playstyle[]).map((key) => ({
    name: dict.labels.playstyle[key],
    value: counts[key],
  }));
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="panel p-4">
      <h3 className="mb-2 font-heading text-gold-light">{dict.admin.charts.playstyle}</h3>
      {!hasData ? (
        <EmptyState dict={dict} />
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
