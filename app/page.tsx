import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fillTemplate, formatEventDate } from "@/lib/i18n/format";
import { getDiscordId } from "@/lib/admin";
import { hasGoldRadarAccess } from "@/lib/goldRadar";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import { GUIDES } from "@/lib/guides";
import { GUILD_CREST_LARGE, GUILD_NAME, GUILD_SCENE } from "@/lib/guild";
import { ROLES, WOW_PROFESSIONS } from "@/lib/constants";
import RichText from "@/components/RichText";
import QuickPollCard from "@/components/quickpoll/QuickPollCard";
import { loadQuickPolls } from "@/lib/quickPolls";
import LoginButton from "@/components/LoginButton";
import CountdownBanner from "@/components/CountdownBanner";
import type { GuildEvent, Role } from "@/lib/types";

const DAY_MS = 864e5;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  const dict = await loadDictionary(locale);
  const t = dict.guildHome;
  const goldRadar = user ? await hasGoldRadarAccess(getDiscordId(user)) : false;
  const [countdown, privacy] = await Promise.all([
    isSectionVisible("home.show.countdown"),
    isSectionVisible("home.show.privacy"),
  ]);

  // Nur Summen aus der Umfrage (keine Namen) - deshalb auch für Besucher
  // ohne Login, z. B. "Heiler gesucht". Gelesen mit service_role, weil die
  // Antworten per RLS nur für Eingeloggte sichtbar sind.
  const admin = createAdminClient();
  const { data: answers } = await admin
    .from("responses")
    .select("participation, role, professions")
    .neq("participation", "nein");
  const players = answers ?? [];
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, players.filter((p) => p.role === r).length])) as Record<Role, number>;
  const withRole = ROLES.reduce((sum, r) => sum + roleCounts[r], 0);
  const wanted = [...ROLES].sort((a, b) => roleCounts[a] - roleCounts[b])[0];
  const professionCounts = WOW_PROFESSIONS.map((p) => ({
    name: p,
    count: players.filter((x) => (x.professions ?? []).includes(p)).length,
  })).sort((a, b) => b.count - a.count);

  // Termine sind nur für Eingeloggte (wie auf /termine)
  let events: (GuildEvent & { signups: number })[] = [];
  if (user) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 3 * 36e5).toISOString())
      .order("starts_at", { ascending: true })
      .limit(3)
      .returns<GuildEvent[]>();
    const ids = (data ?? []).map((e) => e.id);
    const { data: signups } = ids.length
      ? await supabase.from("event_signups_overview").select("event_id, status").in("event_id", ids)
      : { data: [] as { event_id: string; status: string }[] };
    events = (data ?? []).map((e) => ({
      ...e,
      signups: (signups ?? []).filter((s) => s.event_id === e.id && s.status === "dabei").length,
    }));
  }

  const launchIso = process.env.NEXT_PUBLIC_LAUNCH_DATE;
  const launch = launchIso ? new Date(launchIso).getTime() : null;
  const launchTile =
    launch === null
      ? null
      : Date.now() < launch
        ? fillTemplate(t.tileLaunchBefore, { date: formatEventDate(locale, launchIso!) })
        : fillTemplate(t.tileLaunchDay, { day: Math.floor((Date.now() - launch) / DAY_MS) });

  const quickPolls = await loadQuickPolls(supabase, user?.id ?? null, true);
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const applyUrl = process.env.NEXT_PUBLIC_DISCORD_APPLY_URL || invite;
  const nextEvent = events[0];

  return (
    <main className="flex flex-col gap-8">
      {/* Kopfbereich randlos über die ganze Fensterbreite */}
      <section className="relative -mt-8 left-1/2 w-screen -translate-x-1/2 overflow-hidden border-b border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={GUILD_SCENE}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-35"
          style={{ objectPosition: "50% 92%" }}
        />
        <div className="relative mx-auto flex max-w-[1280px] flex-wrap items-center gap-10 px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">{t.kicker}</p>
            <h1 className="font-heading text-5xl font-bold leading-tight tracking-wide sm:text-7xl">{GUILD_NAME}</h1>
            <p className="max-w-xl text-xl text-parchment/90">{t.summary}</p>
            <p className="max-w-xl text-lg text-parchment/90">
              <strong className="text-parchment">{t.recruitLead}</strong> {t.recruitText}
            </p>
            <p className="font-heading text-lg text-gold-light">{t.quote}</p>
            {(invite || applyUrl) && (
              <div className="mt-2 flex flex-wrap gap-3">
                {invite && (
                  <a
                    href={invite}
                    target="_blank"
                    rel="noopener"
                    className="rounded-lg bg-gold px-5 py-3 font-semibold text-ink transition hover:brightness-110"
                  >
                    {t.joinDiscord}
                  </a>
                )}
                {applyUrl && (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener"
                    className="rounded-lg border border-gold-dark bg-ink/60 px-5 py-3 font-medium text-parchment transition hover:bg-gold/10"
                  >
                    {t.apply}
                  </a>
                )}
              </div>
            )}
            {countdown && launch !== null && Date.now() < launch && (
              <div className="mt-4 max-w-md">
                <CountdownBanner />
              </div>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={GUILD_CREST_LARGE}
            alt={`Wappen von ${GUILD_NAME}`}
            className="h-auto w-full max-w-[340px] flex-[1_1_260px] object-contain"
          />
        </div>
      </section>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {launchTile && <Tile label={t.tileLaunch} value={launchTile} />}
        <Tile
          label={t.tileMembers}
          value={fillTemplate(t.tileMembersValue, { count: players.length })}
          hint={t.tileMembersHint}
        />
        {user && (
          <Tile
            label={t.tileNextEvent}
            value={nextEvent ? nextEvent.title : t.tileNoEvent}
            hint={nextEvent ? formatEventDate(locale, nextEvent.starts_at) : undefined}
          />
        )}
        {withRole > 0 && (
          <Tile
            label={t.tileWanted}
            value={dict.labels.role[wanted]}
            hint={fillTemplate(t.tileWantedHint, { count: roleCounts[wanted], total: withRole })}
            warn
          />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {quickPolls.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="heading-ornate text-2xl font-bold">{t.pollsTitle}</h2>
              {quickPolls.map((poll) => (
                <QuickPollCard key={poll.id} poll={poll} loggedIn={!!user} />
              ))}
            </section>
          )}

          {user && (
            <section className="panel p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="heading-ornate text-2xl font-bold">{t.eventsTitle}</h2>
                <Link href="/termine" className="text-sm text-gold-light hover:underline">
                  {t.eventsAll}
                </Link>
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-muted">{t.eventsEmpty}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {events.map((e) => (
                    <Link
                      key={e.id}
                      href={`/termine/${e.id}`}
                      className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel-2 px-4 py-4 transition hover:border-gold-dark"
                    >
                      <div className="min-w-0 flex-[1_1_240px]">
                        <p className="text-lg font-semibold text-parchment">{e.title}</p>
                        <p className="text-sm text-muted">
                          {formatEventDate(locale, e.starts_at)}
                          {e.instance ? ` · ${e.instance}` : ""} ·{" "}
                          {fillTemplate(t.eventSignups, { count: e.signups, max: e.max_size })}
                        </p>
                      </div>
                      <span className="rounded-lg border border-gold-dark px-4 py-2.5 text-sm font-medium text-parchment">
                        {t.eventOpen}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {goldRadar && (
            <section className="panel flex flex-wrap items-center gap-5 border-gold-dark p-6">
              <div className="min-w-0 flex-[999_1_320px]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-soft">{t.terminalKicker}</p>
                <h2 className="heading-ornate mt-1 text-2xl font-bold">{t.terminalTitle}</h2>
                <p className="mt-1 text-muted">{t.terminalText}</p>
              </div>
              <Link
                href="/gold-radar"
                className="rounded-lg bg-amber-soft px-5 py-3 font-semibold text-ink transition hover:brightness-110"
              >
                {t.terminalButton}
              </Link>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="heading-ornate text-2xl font-bold">{t.guidesTitle}</h2>
              <Link href="/guides" className="text-sm text-gold-light hover:underline">
                {t.guidesAll}
              </Link>
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              {GUIDES.map((g) => (
                <Link
                  key={g.slug}
                  href={`/guides/${g.slug}`}
                  className="panel block p-4 transition hover:border-gold-dark"
                >
                  <p className="font-semibold text-parchment">{g.title}</p>
                  <p className="mt-1 text-sm text-muted">{g.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          {user ? (
            <section className="panel p-5">
              <h2 className="heading-ornate text-xl font-bold">{t.mineTitle}</h2>
              <p className="mb-3 text-sm text-muted">{t.mineHint}</p>
              <div className="flex flex-col gap-2">
                {[
                  { href: "/charaktere", label: t.mineCharacters },
                  { href: "/umfrage", label: t.mineProfessions },
                  { href: "/verfuegbarkeit", label: t.mineAvailability },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-lg border border-line bg-panel-2 px-4 py-3 text-parchment transition hover:border-gold-dark"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <section className="panel flex flex-col gap-3 p-5">
              <h2 className="heading-ornate text-xl font-bold">{t.loginTitle}</h2>
              <p className="text-sm text-muted">{t.loginText}</p>
              <LoginButton />
            </section>
          )}

          {players.length > 0 && (
            <section className="panel p-5">
              <h2 className="heading-ornate text-xl font-bold">{t.lineupTitle}</h2>
              <p className="mb-4 text-sm text-muted">{fillTemplate(t.lineupHint, { count: players.length })}</p>
              <div className="flex flex-col gap-3">
                {[...ROLES]
                  .sort((a, b) => roleCounts[b] - roleCounts[a])
                  .map((r) => (
                    <Bar
                      key={r}
                      label={dict.labels.role[r]}
                      count={roleCounts[r]}
                      total={players.length}
                      warn={r === wanted}
                    />
                  ))}
                <Bar label={t.lineupOpen} count={players.length - withRole} total={players.length} dim />
              </div>
              {user && (
                <Link href="/charaktere" className="mt-4 inline-block text-sm text-gold-light hover:underline">
                  {t.lineupLink}
                </Link>
              )}
            </section>
          )}

          {players.length > 0 && (
            <section className="panel p-5">
              <h2 className="heading-ornate text-xl font-bold">{t.professionsTitle}</h2>
              <p className="mb-3 text-sm text-muted">{t.professionsHint}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {professionCounts.map((p, i) => (
                  <div key={p.name} className="flex justify-between gap-3 pr-3">
                    <span>{p.name}</span>
                    <span className={`font-semibold ${i === professionCounts.length - 1 ? "text-amber-soft" : ""}`}>
                      {p.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel p-5">
            <h2 className="heading-ornate mb-3 text-xl font-bold">{t.ranksTitle}</h2>
            <ol className="flex flex-col gap-2.5 text-sm">
              {t.ranks.map((r, i) => (
                <li key={r.name} className="flex justify-between gap-3">
                  <span className={`font-semibold ${i === 0 ? "text-gold" : i < 2 ? "text-gold-light" : "text-parchment/85"}`}>
                    {r.name}
                  </span>
                  <span className="text-muted">{r.role}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {privacy && (
        <section className="panel p-5 text-sm text-muted">
          <h2 className="mb-2 font-heading text-base text-parchment">{dict.home.privacyTitle}</h2>
          <RichText value={dict.home.privacyText} />
        </section>
      )}
    </main>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="panel px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${warn ? "text-amber-soft" : "text-parchment"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Bar({ label, count, total, warn, dim }: { label: string; count: number; total: number; warn?: boolean; dim?: boolean }) {
  const width = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className={`flex justify-between text-sm ${dim ? "text-muted" : ""}`}>
        <span>{label}</span>
        <span className={`font-semibold ${warn ? "text-amber-soft" : ""}`}>{count}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-line">
        <div
          className={`h-2 rounded-full ${dim ? "bg-muted/40" : warn ? "bg-amber-soft" : "bg-gold"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
