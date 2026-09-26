import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, getLocale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/types";
import type { ParticipantSummary } from "@/lib/types";
import StatTiles from "@/components/admin/StatTiles";
import InsightBanner from "@/components/admin/InsightBanner";
import RoleNeedBanner from "@/components/admin/RoleNeedBanner";
import FactionChart from "@/components/admin/FactionChart";
import PlaystyleChart from "@/components/admin/PlaystyleChart";
import ClassRoleCharts from "@/components/admin/ClassRoleCharts";
import ClassPriorityOverview from "@/components/admin/ClassPriorityOverview";

export default async function UebersichtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const dict = getDictionary(await getLocale());

  const { data: rows } = await supabase
    .from("participants_overview")
    .select("*")
    .returns<ParticipantSummary[]>();

  const participants = (rows ?? []).slice().sort((a, b) =>
    (a.first_name ?? a.display_name).localeCompare(
      b.first_name ?? b.display_name,
      "de"
    )
  );

  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.overview.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>

      <StatTiles responses={participants} dict={dict} />
      <InsightBanner responses={participants} dict={dict} />
      <RoleNeedBanner responses={participants} dict={dict} />

      <div className="grid gap-6 sm:grid-cols-2">
        <FactionChart responses={participants} dict={dict} />
        <PlaystyleChart responses={participants} dict={dict} />
      </div>

      <ClassRoleCharts responses={participants} dict={dict} />
      <ClassPriorityOverview responses={participants} dict={dict} />

      <div className="panel flex flex-col items-center gap-3 p-4 text-center">
        <p className="text-sm text-slate-400">{dict.overview.memeCaption}</p>
        <Image
          src="/images/meme-adult-responsibilities.jpg"
          alt={dict.overview.memeAlt}
          width={640}
          height={906}
          className="max-w-[240px] rounded-lg border border-gold/30"
        />
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
                {formatSummary(p, dict)}
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
              {dict.labels.participation[p.participation]}
            </span>
          </li>
        ))}
        {participants.length === 0 && (
          <li className="p-4 text-center text-sm text-slate-500">
            {dict.overview.noResponses}
          </li>
        )}
      </ul>
    </main>
  );
}

function formatSummary(p: ParticipantSummary, dict: Dictionary): string {
  return (
    [
      p.faction ? dict.labels.faction[p.faction] : null,
      p.playstyle ? dict.labels.playstyle[p.playstyle] : null,
      p.classes && p.classes.length > 0
        ? p.classes.map((c) => dict.labels.class[c] ?? c).join(" → ")
        : null,
      p.role ? dict.labels.role[p.role] : null,
    ]
      .filter(Boolean)
      .join(" · ") || "–"
  );
}
