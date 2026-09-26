"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ParticipantSummary } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import { EmptyState } from "./FactionChart";

function countClasses(responses: ParticipantSummary[], dict: Dictionary) {
  const counts = new Map<string, number>();
  responses.forEach((r) => {
    r.classes?.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  });
  return Array.from(counts.entries()).map(([cls, value]) => ({
    name: dict.labels.class[cls] ?? cls,
    value,
  }));
}

function countRoles(responses: ParticipantSummary[], dict: Dictionary) {
  const counts = new Map<string, number>();
  responses.forEach((r) => {
    if (!r.role) return;
    const label = dict.labels.role[r.role];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

export default function ClassRoleCharts({
  responses,
  dict,
}: {
  responses: ParticipantSummary[];
  dict: Dictionary;
}) {
  const classData = countClasses(responses, dict);
  const roleData = countRoles(responses, dict);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="panel p-4">
        <h3 className="mb-2 font-heading text-gold-light">{dict.admin.charts.classes}</h3>
        {classData.length === 0 ? (
          <EmptyState dict={dict} />
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, classData.length * 40)}
          >
            <BarChart data={classData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" allowDecimals={false} stroke="#94a3b8" />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                interval={0}
                stroke="#94a3b8"
              />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 font-heading text-gold-light">{dict.admin.charts.roles}</h3>
        {roleData.length === 0 ? (
          <EmptyState dict={dict} />
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
