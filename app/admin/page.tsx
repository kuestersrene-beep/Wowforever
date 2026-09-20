import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import type { SurveyResponse } from "@/lib/types";
import StatTiles from "@/components/admin/StatTiles";
import FactionChart from "@/components/admin/FactionChart";
import PlaystyleChart from "@/components/admin/PlaystyleChart";
import ClassRoleCharts from "@/components/admin/ClassRoleCharts";
import ClassPriorityOverview from "@/components/admin/ClassPriorityOverview";
import InsightBanner from "@/components/admin/InsightBanner";
import RoleNeedBanner from "@/components/admin/RoleNeedBanner";
import ParticipantsTable from "@/components/admin/ParticipantsTable";
import CsvExportButton from "@/components/admin/CsvExportButton";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    redirect("/");
  }

  // Admin-Client mit service_role Key: sieht ALLE Zeilen, unabhängig von
  // RLS. Der Zugriff auf diese Seite ist bereits über isAdmin() oben
  // abgesichert.
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("responses")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<SurveyResponse[]>();

  if (error) {
    return (
      <main className="flex flex-col gap-4">
        <p className="text-red-400">
          Fehler beim Laden der Daten: {error.message}
        </p>
      </main>
    );
  }

  const responses = data ?? [];

  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Admin-Dashboard</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          ← Zurück
        </Link>
      </div>

      <StatTiles responses={responses} />
      <InsightBanner responses={responses} />
      <RoleNeedBanner responses={responses} />

      <div className="grid gap-6 sm:grid-cols-2">
        <FactionChart responses={responses} />
        <PlaystyleChart responses={responses} />
      </div>

      <ClassRoleCharts responses={responses} />
      <ClassPriorityOverview responses={responses} />

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-gold-light">
          Alle Teilnehmer:innen
        </h2>
        <CsvExportButton responses={responses} />
      </div>
      <ParticipantsTable responses={responses} />
    </main>
  );
}
