import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import { formatEventDate, formatLoadError, formatPending } from "@/lib/i18n/format";
import { isGoldRadarOwner } from "@/lib/goldRadar";
import type { AdminResponseRow, SurveyResponse } from "@/lib/types";
import StatTiles from "@/components/admin/StatTiles";
import ClassRoleCharts from "@/components/admin/ClassRoleCharts";
import ClassPriorityOverview from "@/components/admin/ClassPriorityOverview";
import RoleNeedBanner from "@/components/admin/RoleNeedBanner";
import ParticipantsTable from "@/components/admin/ParticipantsTable";
import CsvExportButton from "@/components/admin/CsvExportButton";
import DownloadsManager from "@/components/admin/DownloadsManager";
import LogoSettings from "@/components/admin/LogoSettings";
import QuickPollManager from "@/components/admin/QuickPollManager";
import { loadQuickPolls } from "@/lib/quickPolls";
import { getSiteSettings } from "@/lib/siteSettings";
import type { DownloadItem } from "@/lib/types";

// Ab so vielen Tagen als Hatchling steht jemand als "bereit zur Beförderung" da (wie im Bot:
// HATCHLING_TAGE in discord-setup/rollensync.py)
const HATCHLING_DAYS = 14;

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(getDiscordId(user)))) {
    redirect("/");
  }

  const locale = await getLocale();
  const dict = await loadDictionary(locale);

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

  // Gildennamen-Vorschläge, die auf Freigabe warten (früher als Hinweis auf
  // der Startseite, jetzt hier im Admin-Bereich)
  const { count: pendingGuildNames } = await adminSupabase
    .from("guild_name_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "offen");

  // Probezeiten: seit wann jemand Hatchling (Gilde) bzw. Trial (Raid) ist. Pflegt der
  // Gilden-Bot (discord-setup/rollensync.py) in discord_rank_since.
  const [{ data: rankRows }, { data: memberRows }] = await Promise.all([
    adminSupabase
      .from("discord_rank_since")
      .select("discord_id, rank, since")
      .in("rank", ["Hatchling", "Trial"])
      .order("since", { ascending: true })
      .returns<{ discord_id: string; rank: string; since: string }[]>(),
    adminSupabase.from("discord_members").select("discord_id, display_name").returns<{ discord_id: string; display_name: string }[]>(),
  ]);
  const memberNames = new Map((memberRows ?? []).map((m) => [m.discord_id, m.display_name]));
  const probation = (rankRows ?? []).map((r) => ({
    ...r,
    name: memberNames.get(r.discord_id) ?? r.discord_id,
    days: Math.floor((Date.now() - new Date(r.since).getTime()) / 864e5),
  }));
  const dueCount = probation.filter((p) => p.rank === "Hatchling" && p.days >= HATCHLING_DAYS).length;

  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.admin.title}</h1>
      </div>

      {/* Alle Admin-Bereiche an einer Stelle - einige liegen auf eigenen
          Seiten, der Rest weiter unten auf dieser Seite. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        {[
          {
            href: "/admin/texte",
            title: "✎ Texte bearbeiten",
            hint: "Startseite und Hinweise auf allen Seiten ändern, Abschnitte ein- und ausblenden",
          },
          {
            href: "/admin/fraktionen",
            title: dict.guildDrafts.admin.manageLink,
            hint: `${dict.guildDrafts.admin.manageHint}. Stimmen zurücksetzen.`,
          },
          {
            href: "/gildenname",
            title: "Gildennamen-Vorschläge",
            hint: "Vorschläge freigeben oder ablehnen, Umfrage ein- und ausblenden",
            badge: pendingGuildNames ? formatPending(dict, pendingGuildNames) : null,
          },
          ...(isGoldRadarOwner(getDiscordId(user))
            ? [
                {
                  href: "/admin/gold-radar",
                  title: "Blackwater Terminal",
                  hint: "Nutzung, Scan-Uploads, Feedback und Tool-Daten",
                },
              ]
            : []),
          {
            href: "#probezeiten",
            title: "Neuzugänge & Probezeiten",
            hint: "Wie lange jemand schon Hatchling oder Trial ist",
            badge: dueCount ? `${dueCount} bereit zur Beförderung` : null,
          },
          { href: "#kurzabstimmungen", title: dict.quickPoll.admin.title, hint: "Abstimmungen auf der Startseite" },
          { href: "#downloads", title: dict.downloads.title, hint: "Addons und Dateien für Mitglieder" },
          { href: "#logo", title: dict.admin.logo.title, hint: "Logo und Bild für den Countdown" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="panel flex items-center justify-between gap-3 p-4 transition hover:border-gold-dark"
          >
            <span>
              <span className="block font-heading text-base text-gold-light">
                {c.title}
                {"badge" in c && c.badge && (
                  <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 font-sans text-xs text-ink">
                    {c.badge}
                  </span>
                )}
              </span>
              <span className="text-sm text-muted">{c.hint}</span>
            </span>
            <span className="text-gold-light">→</span>
          </Link>
        ))}
      </div>

      <h2 className="heading-ornate -mb-4 text-xl">Umfrage-Auswertung</h2>
      <StatTiles responses={responses} dict={dict} />
      <RoleNeedBanner responses={responses} dict={dict} />

      <ClassRoleCharts responses={responses} dict={dict} />
      <ClassPriorityOverview responses={responses} dict={dict} />

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-gold-light">
          {dict.admin.allParticipants}
        </h2>
        <CsvExportButton responses={responses} dict={dict} />
      </div>
      <ParticipantsTable responses={responses} dict={dict} locale={locale} />

      <h2 id="probezeiten" className="scroll-mt-6 font-heading text-lg text-gold-light">
        Neuzugänge &amp; Probezeiten
      </h2>
      <p className="-mt-6 text-sm text-muted">
        Hatchling = neu in der Gilde, nach {HATCHLING_DAYS} Tagen erinnert der Bot im Offiziers-Chat an die
        Beförderung zum Mitglied. Trial = Raid-Probezeit nach der Bewerbung. Erfasst seit dem Start des Bots.
      </p>
      {probation.length === 0 ? (
        <p className="panel p-4 text-sm text-muted">Gerade ist niemand in der Probezeit.</p>
      ) : (
        <div className="panel overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Rang</th>
                <th className="px-3 py-2">seit</th>
                <th className="px-3 py-2 text-right">Tage</th>
              </tr>
            </thead>
            <tbody>
              {probation.map((p) => {
                const due = p.rank === "Hatchling" && p.days >= HATCHLING_DAYS;
                return (
                  <tr key={`${p.discord_id}-${p.rank}`} className="border-t border-line">
                    <td className="px-3 py-2 text-parchment">{p.name}</td>
                    <td className="px-3 py-2">{p.rank}</td>
                    <td className="px-3 py-2 text-muted">{formatEventDate(locale, p.since)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${due ? "text-amber-soft" : ""}`}>
                      {p.days}
                      {due && <span className="ml-2 text-xs font-normal">→ Mitglied?</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 id="downloads" className="scroll-mt-6 font-heading text-lg text-gold-light">
        {dict.downloads.title}
      </h2>
      <DownloadsManager downloads={downloadsData ?? []} dict={dict} />

      <h2 id="kurzabstimmungen" className="scroll-mt-6 font-heading text-lg text-gold-light">
        {dict.quickPoll.admin.title}
      </h2>
      <p className="-mt-6 text-sm text-slate-400">{dict.quickPoll.admin.hint}</p>
      <QuickPollManager
        polls={await loadQuickPolls(adminSupabase, user.id, false)}
        dict={dict}
      />

      <h2 id="logo" className="scroll-mt-6 font-heading text-lg text-gold-light">
        {dict.admin.logo.title}
      </h2>
      <LogoSettings settings={await getSiteSettings()} dict={dict} />
    </main>
  );
}
