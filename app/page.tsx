import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fillTemplate, formatEventDate } from "@/lib/i18n/format";
import { getDiscordId } from "@/lib/admin";
import { hasGoldRadarAccess } from "@/lib/goldRadar";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import { GUIDES } from "@/lib/guides";
import { GUILD_BANNER, GUILD_NAME, GUILD_SCENE } from "@/lib/guild";
import RichText from "@/components/RichText";
import QuickPollCard from "@/components/quickpoll/QuickPollCard";
import { loadQuickPolls } from "@/lib/quickPolls";
import CountdownBanner from "@/components/CountdownBanner";
import type { Dictionary } from "@/lib/i18n/types";
import type { GuildEvent } from "@/lib/types";

const DAY_MS = 864e5;

// Startseite in zwei Fassungen: Gäste sehen, wer wir sind und wie man zu uns
// kommt; Mitglieder ihre Gildenhalle (Termine, Abstimmungen, Tools). Details
// wie Rollen-, Berufe- und Zeitenübersicht stehen nur einmal, auf /uebersicht.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const loginFailed = (await searchParams).error === "login_fehlgeschlagen";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  const dict = await loadDictionary(locale);
  const t = dict.guildHome;
  const [countdown, privacy] = await Promise.all([
    isSectionVisible("home.show.countdown"),
    isSectionVisible("home.show.privacy"),
  ]);

  const launchIso = process.env.NEXT_PUBLIC_LAUNCH_DATE;
  const launch = launchIso ? new Date(launchIso).getTime() : null;
  const beforeLaunch = launch !== null && Date.now() < launch;
  const launchTile =
    launch === null
      ? null
      : beforeLaunch
        ? fillTemplate(t.tileLaunchBefore, { date: formatEventDate(locale, launchIso!) })
        : fillTemplate(t.tileLaunchDay, { day: Math.floor((Date.now() - launch) / DAY_MS) });
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const applyUrl = process.env.NEXT_PUBLIC_DISCORD_APPLY_URL || invite;

  // Wen wir gerade suchen: freier Text aus dem Admin-Bereich ("Texte
  // bearbeiten"), damit die Suche ohne Update eingeschränkt werden kann,
  // z. B. später nur noch Heiler für die Raid-Roster.
  const wantedTile = <Tile label={t.recruitTileLabel} value={t.recruitTileValue} hint={t.recruitTileHint} warn />;

  return (
    <main className="flex flex-col gap-8">
      {loginFailed && !user && (
        <p role="alert" className="panel border-amber-soft/60 p-4 text-amber-soft">
          {dict.login.failed}
        </p>
      )}
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
        <div className="relative mx-auto flex max-w-[1280px] flex-wrap items-center gap-8 px-4 py-10 sm:gap-10 sm:px-6 sm:py-20">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">{t.kicker}</p>
            <h1 className="font-heading text-4xl font-bold leading-tight tracking-wide sm:text-7xl">{GUILD_NAME}</h1>
            <p className="max-w-xl text-xl text-parchment/90">{t.summary}</p>
            {/* Der Rekrutierungsaufruf richtet sich an Gäste */}
            {!user && (
              <p className="max-w-xl text-lg text-parchment/90">
                <strong className="text-parchment">{t.recruitLead}</strong> {t.recruitText}
              </p>
            )}
            <p className="font-heading text-lg text-gold-light">{t.quote}</p>
            {!user && (invite || applyUrl) && (
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
            {countdown && beforeLaunch && (
              <div className="mt-3">
                <CountdownBanner />
              </div>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={GUILD_BANNER}
            alt={`Banner von ${GUILD_NAME}`}
            className="mx-auto hidden h-auto max-h-[560px] w-auto max-w-full object-contain sm:block"
          />
        </div>
      </section>

      {user ? (
        <MemberHome
          supabase={supabase}
          userId={user.id}
          discordId={getDiscordId(user)}
          dict={dict}
          locale={locale}
          launchTile={beforeLaunch ? null : launchTile}
          wantedTile={wantedTile}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-6">
            <section className="panel min-w-0 flex-[999_1_480px] p-6">
              <h2 className="heading-ornate mb-4 text-2xl font-bold">{t.joinTitle}</h2>
              <ol className="flex flex-col gap-4">
                {t.joinSteps.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-dark font-heading font-bold text-gold">
                      {i + 1}
                    </span>
                    <span className="pt-1.5 text-parchment/90">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
              {wantedTile}
              <Ranks t={t} />
            </div>
          </div>
          {privacy && (
            <section className="panel p-5 text-sm text-muted">
              <h2 className="mb-2 font-heading text-base text-parchment">{dict.home.privacyTitle}</h2>
              <RichText value={dict.home.privacyText} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

async function MemberHome({
  supabase,
  userId,
  discordId,
  dict,
  locale,
  launchTile,
  wantedTile,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  discordId: string | null;
  dict: Dictionary;
  locale: "de" | "en";
  launchTile: string | null;
  wantedTile: React.ReactNode;
}) {
  const t = dict.guildHome;
  const [goldRadar, quickPolls, { data: eventRows }, { data: ownResponse }, { data: ownAvailability }] = await Promise.all([
    hasGoldRadarAccess(discordId),
    loadQuickPolls(supabase, userId, true),
    supabase
      .from("events")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 3 * 36e5).toISOString())
      .order("starts_at", { ascending: true })
      .limit(3)
      .returns<GuildEvent[]>(),
    // Was die Person selbst noch nicht eingetragen hat ("offen" bei Mein Charakter)
    supabase.from("responses").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("availability").select("slots").eq("user_id", userId).maybeSingle<{ slots: string[] }>(),
  ]);
  const ids = (eventRows ?? []).map((e) => e.id);
  const { data: signups } = ids.length
    ? await supabase.from("event_signups_overview").select("event_id, status").in("event_id", ids)
    : { data: [] as { event_id: string; status: string }[] };
  const events = (eventRows ?? []).map((e) => ({
    ...e,
    signups: (signups ?? []).filter((s) => s.event_id === e.id && s.status === "dabei").length,
  }));
  const nextEvent = events[0];

  return (
    <>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {launchTile && <Tile label={t.tileLaunch} value={launchTile} />}
        <Tile
          label={t.tileNextEvent}
          value={nextEvent ? nextEvent.title : t.tileNoEvent}
          hint={nextEvent ? formatEventDate(locale, nextEvent.starts_at) : undefined}
        />
        {wantedTile}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {quickPolls.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="heading-ornate text-2xl font-bold">{t.pollsTitle}</h2>
              {quickPolls.map((poll) => (
                <QuickPollCard key={poll.id} poll={poll} loggedIn />
              ))}
            </section>
          )}

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
                <Link key={g.slug} href={`/guides/${g.slug}`} className="panel block p-4 transition hover:border-gold-dark">
                  <p className="font-semibold text-parchment">{g.title}</p>
                  <p className="mt-1 text-sm text-muted">{g.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <section className="panel p-5">
            <h2 className="heading-ornate text-xl font-bold">{t.mineTitle}</h2>
            <p className="mb-3 text-sm text-muted">{t.mineHint}</p>
            <div className="flex flex-col gap-2">
              {[
                { href: "/charaktere", label: t.mineCharacters, open: false },
                { href: "/umfrage", label: t.mineProfessions, open: !ownResponse },
                { href: "/verfuegbarkeit", label: t.mineAvailability, open: !ownAvailability?.slots?.length },
                { href: "/downloads", label: t.mineDownloads, open: false },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center justify-between gap-2 rounded-lg border bg-panel-2 px-4 py-3 text-parchment transition hover:border-gold-dark ${
                    l.open ? "border-amber-soft/50" : "border-line"
                  }`}
                >
                  {l.label}
                  {l.open && (
                    <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-ink">{t.mineOpen}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
          <Ranks t={t} />
        </aside>
      </div>
    </>
  );
}

function Ranks({ t }: { t: Dictionary["guildHome"] }) {
  return (
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
