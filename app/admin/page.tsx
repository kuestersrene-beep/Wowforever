import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatLoadError } from "@/lib/i18n/format";
import type { AdminResponseRow, SurveyResponse } from "@/lib/types";
import StatTiles from "@/components/admin/StatTiles";
import FactionChart from "@/components/admin/FactionChart";
import PlaystyleChart from "@/components/admin/PlaystyleChart";
import ClassRoleCharts from "@/components/admin/ClassRoleCharts";
import ClassPriorityOverview from "@/components/admin/ClassPriorityOverview";
import InsightBanner from "@/components/admin/InsightBanner";
import RoleNeedBanner from "@/components/admin/RoleNeedBanner";
import ParticipantsTable from "@/components/admin/ParticipantsTable";
import CsvExportButton from "@/components/admin/CsvExportButton";
import DownloadsManager from "@/components/admin/DownloadsManager";
import type { DownloadItem } from "@/lib/types";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    redirect("/");
  }

  const locale = await getLocale();
  const dict = getDictionary(locale);

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
        <p className="text-red-400">{formatLoadError(dict, error.message)}</p>
      </main>
    );
  }

  const { data: notesData } = await adminSupabase
    .from("admin_notes")
    .select("user_id, note");
  const notesByUser = new Map(
    (notesData ?? []).map((n) => [n.user_id as string, n.note as string | null])
  );

  const responses: AdminResponseRow[] = (data ?? []).map((r) => ({
    ...r,
    admin_note: notesByUser.get(r.user_id) ?? null,
  }));

  const { data: downloadsData } = await adminSupabase
    .from("downloads")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<DownloadItem[]>();

  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.admin.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>

      <StatTiles responses={responses} dict={dict} />
      <InsightBanner responses={responses} dict={dict} />
      <RoleNeedBanner responses={responses} dict={dict} />

      <div className="grid gap-6 sm:grid-cols-2">
        <FactionChart responses={responses} dict={dict} />
        <PlaystyleChart responses={responses} dict={dict} />
      </div>

      <ClassRoleCharts responses={responses} dict={dict} />
      <ClassPriorityOverview responses={responses} dict={dict} />

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-gold-light">
          {dict.admin.allParticipants}
        </h2>
        <CsvExportButton responses={responses} dict={dict} />
      </div>
      <ParticipantsTable responses={responses} dict={dict} locale={locale} />

      <h2 className="font-heading text-lg text-gold-light">
        {dict.downloads.title}
      </h2>
      <DownloadsManager downloads={downloadsData ?? []} dict={dict} />
    </main>
  );
}
