"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { SurveyResponse } from "@/lib/types";
import {
  FACTION_LABELS,
  FREQUENCY_LABELS,
  PARTICIPATION_LABELS,
  PLAYSTYLE_LABELS,
  ROLE_LABELS,
} from "@/lib/constants";

type SortKey = "display_name" | "participation" | "faction" | "updated_at";

export default function ParticipantsTable({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const [filterParticipation, setFilterParticipation] = useState<string>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let rows = responses;
    if (filterParticipation !== "alle") {
      rows = rows.filter((r) => r.participation === filterParticipation);
    }
    rows = [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv);
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [responses, filterParticipation, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Filter:</span>
        {["alle", "ja", "vielleicht", "nein"].map((value) => (
          <button
            key={value}
            onClick={() => setFilterParticipation(value)}
            className={`rounded-full px-3 py-1 ${
              filterParticipation === value
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            {value === "alle" ? "Alle" : PARTICIPATION_LABELS[value as "ja" | "vielleicht" | "nein"]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <Th label="Name" onClick={() => toggleSort("display_name")} />
              <Th label="Status" onClick={() => toggleSort("participation")} />
              <Th label="Fraktion" onClick={() => toggleSort("faction")} />
              <th className="px-3 py-2">Spielstil</th>
              <th className="px-3 py-2">Klasse</th>
              <th className="px-3 py-2">Rolle</th>
              <th className="px-3 py-2">Häufigkeit</th>
              <th className="px-3 py-2">Kommentar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr key={r.user_id} className="hover:bg-slate-900/60">
                <td className="flex items-center gap-2 px-3 py-2">
                  {r.avatar_url ? (
                    <Image
                      src={r.avatar_url}
                      alt={r.display_name}
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-slate-700" />
                  )}
                  {r.display_name}
                  {r.first_name && (
                    <span className="text-slate-400"> ({r.first_name})</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {PARTICIPATION_LABELS[r.participation]}
                </td>
                <td className="px-3 py-2">
                  {r.faction ? FACTION_LABELS[r.faction] : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.playstyle ? PLAYSTYLE_LABELS[r.playstyle] : "–"}
                </td>
                <td className="px-3 py-2">{r.class ?? "–"}</td>
                <td className="px-3 py-2">{r.role ? ROLE_LABELS[r.role] : "–"}</td>
                <td className="px-3 py-2">
                  {r.frequency ? FREQUENCY_LABELS[r.frequency] : "–"}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2" title={r.comment ?? ""}>
                  {r.comment ?? "–"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none px-3 py-2 hover:text-slate-200"
    >
      {label} ↕
    </th>
  );
}
