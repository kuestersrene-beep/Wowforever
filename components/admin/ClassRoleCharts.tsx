"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SurveyResponse } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/constants";
import { EmptyState } from "./FactionChart";

function countBy(responses: SurveyResponse[], key: "class" | "role") {
  const counts = new Map<string, number>();
  responses.forEach((r) => {
    const value = r[key];
    if (!value) return;
    const label = key === "role" ? ROLE_LABELS[value as keyof typeof ROLE_LABELS] : value;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

export default function ClassRoleCharts({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const classData = countBy(responses, "class");
  const roleData = countBy(responses, "role");

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold">Klassen</h3>
        {classData.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={classData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" allowDecimals={false} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={90} stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold">Rollen</h3>
        {roleData.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={roleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis allowDecimals={false} stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
