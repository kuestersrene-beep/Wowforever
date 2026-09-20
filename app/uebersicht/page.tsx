import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FACTION_LABELS,
  PARTICIPATION_LABELS,
  PLAYSTYLE_LABELS,
} from "@/lib/constants";

interface OverviewRow {
  user_id: string;
  display_name: string;
  first_name: string | null;
  avatar_url: string | null;
  participation: "ja" | "vielleicht" | "nein";
  faction: "horde" | "allianz" | "egal" | null;
  playstyle: "pvp" | "pve" | "beides" | null;
}

export default async function UebersichtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: rows } = await supabase
    .from("participants_overview")
    .select("*")
    .returns<OverviewRow[]>();

  const participants = rows ?? [];
  const ja = participants.filter((p) => p.participation === "ja").length;
  const vielleicht = participants.filter(
    (p) => p.participation === "vielleicht"
  ).length;
  const nein = participants.filter((p) => p.participation === "nein").length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Übersicht</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          ← Zurück
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Ja" value={ja} color="text-emerald-400" />
        <StatTile label="Vielleicht" value={vielleicht} color="text-amber-400" />
        <StatTile label="Nein" value={nein} color="text-red-400" />
      </div>

      <ul className="flex flex-col divide-y divide-slate-800 panel">
        {participants.map((p) => (
          <li key={p.user_id} className="flex items-center gap-3 p-3">
            {p.avatar_url ? (
              <Image
                src={p.avatar_url}
                alt={p.display_name}
                width={36}
                height={36}
                className="rounded-full"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-slate-700" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {p.display_name}
                {p.first_name && (
                  <span className="text-slate-400"> ({p.first_name})</span>
                )}
              </p>
              <p className="text-xs text-slate-400">
                {p.faction ? FACTION_LABELS[p.faction] : "–"}
                {p.playstyle ? ` · ${PLAYSTYLE_LABELS[p.playstyle]}` : ""}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                p.participation === "ja"
                  ? "bg-emerald-950 text-emerald-400"
                  : p.participation === "vielleicht"
                    ? "bg-amber-950 text-amber-400"
                    : "bg-red-950 text-red-400"
              }`}
            >
              {PARTICIPATION_LABELS[p.participation]}
            </span>
          </li>
        ))}
        {participants.length === 0 && (
          <li className="p-4 text-center text-sm text-slate-500">
            Noch keine Antworten.
          </li>
        )}
      </ul>
    </main>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="panel p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
