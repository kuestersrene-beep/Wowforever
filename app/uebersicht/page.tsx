import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, getLocale } from "@/lib/i18n";
import type { AvailabilitySummary, ParticipantSummary } from "@/lib/types";
import StatTiles from "@/components/admin/StatTiles";
import AvailabilityOverview from "@/components/AvailabilityOverview";
import ProfessionOverview from "@/components/ProfessionOverview";
import RoleNeedBanner from "@/components/admin/RoleNeedBanner";
import ClassRoleCharts from "@/components/admin/ClassRoleCharts";
import ClassPriorityOverview from "@/components/admin/ClassPriorityOverview";
import Emblem from "@/components/ui/Emblem";
import DiscordNameLink from "@/components/ui/DiscordNameLink";
import ParticipantSummaryLine from "@/components/ParticipantSummaryLine";

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

  const { data: availabilityRows } = await supabase
    .from("availability_overview")
    .select("*")
    .returns<AvailabilitySummary[]>();

  return (
    <main className="flex flex-col gap-8">
      <Emblem className="mx-auto h-14 w-14" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.overview.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>

      {/* Reihenfolge nach dem, was beim Finden von Mitstreitern für die
          ersten Wochen am meisten hilft: Kurzstand -> wann hat wer Zeit ->
          wer kann welchen Beruf -> wer ist dabei -> Klassen-Auswertung.
          Fraktion und Spielstil sind entschieden und tauchen nicht mehr auf. */}
      <StatTiles responses={participants} dict={dict} />
      <RoleNeedBanner responses={participants} dict={dict} />

      <AvailabilityOverview rows={availabilityRows ?? []} dict={dict} />

      <ProfessionOverview responses={participants} dict={dict} />

      <h2 className="-mb-4 font-heading text-lg text-gold-light">
        {dict.overview.participantsTitle}
      </h2>
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
                <DiscordNameLink discordId={p.discord_id} name={p.display_name} />
                {p.first_name && (
                  <span className="text-slate-400"> ({p.first_name})</span>
                )}
              </p>
              <ParticipantSummaryLine p={p} dict={dict} />
              {p.admin_note && (
                <p className="mt-0.5 text-xs italic text-gold-light">
                  {dict.overview.noteLabel}: {p.admin_note}
                </p>
              )}
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

      <h2 className="-mb-4 font-heading text-lg text-gold-light">
        {dict.overview.analysisTitle}
      </h2>
      <ClassRoleCharts responses={participants} dict={dict} />
      <ClassPriorityOverview responses={participants} dict={dict} />
    </main>
  );
}
