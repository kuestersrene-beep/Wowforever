"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { AdminResponseRow } from "@/lib/types";
import type { Dictionary, Locale } from "@/lib/i18n/types";
import AdminNoteCell from "./AdminNoteCell";

type SortKey = "display_name" | "participation" | "faction" | "updated_at";

export default function ParticipantsTable({
  responses,
  dict,
  locale,
}: {
  responses: AdminResponseRow[];
  dict: Dictionary;
  locale: Locale;
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
        <span className="text-slate-400">{dict.admin.filterLabel}</span>
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
            {value === "alle"
              ? dict.admin.filterAll
              : dict.labels.participation[value as "ja" | "vielleicht" | "nein"]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gold/20">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-slate-400">
            <tr>
              <Th label={dict.admin.table.name} onClick={() => toggleSort("display_name")} />
              <Th label={dict.admin.table.status} onClick={() => toggleSort("participation")} />
              <Th label={dict.admin.table.faction} onClick={() => toggleSort("faction")} />
              <th className="px-3 py-2">{dict.admin.table.playstyle}</th>
              <th className="px-3 py-2">{dict.admin.table.class}</th>
              <th className="px-3 py-2">{dict.admin.table.role}</th>
              <th className="px-3 py-2">{dict.admin.table.profession}</th>
              <th className="px-3 py-2">{dict.admin.table.frequency}</th>
              <th className="px-3 py-2">{dict.admin.table.comment}</th>
              <Th label={dict.admin.table.updated} onClick={() => toggleSort("updated_at")} />
              <th className="px-3 py-2">{dict.admin.table.adminNote}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr key={r.user_id} className="hover:bg-gold/5">
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
                  {dict.labels.participation[r.participation]}
                </td>
                <td className="px-3 py-2">
                  {r.faction ? dict.labels.faction[r.faction] : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.playstyle ? dict.labels.playstyle[r.playstyle] : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.classes && r.classes.length > 0
                    ? r.classes.map((c) => dict.labels.class[c] ?? c).join(" → ")
                    : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.role ? dict.labels.role[r.role] : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.professions && r.professions.length > 0
                    ? r.professions.map((p) => dict.labels.profession[p] ?? p).join(" + ")
                    : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.frequency ? dict.labels.frequency[r.frequency] : "–"}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2" title={r.comment ?? ""}>
                  {r.comment ?? "–"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                  {new Date(r.updated_at).toLocaleString(
                    locale === "en" ? "en-US" : "de-DE",
                    { dateStyle: "short", timeStyle: "short" }
                  )}
                </td>
                <td className="px-3 py-2">
                  <AdminNoteCell
                    userId={r.user_id}
                    initialNote={r.admin_note}
                    placeholder={dict.admin.table.adminNotePlaceholder}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                  {dict.admin.table.empty}
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
