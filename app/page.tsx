import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { formatPending } from "@/lib/i18n/format";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import QuickPollCard from "@/components/quickpoll/QuickPollCard";
import { loadQuickPolls } from "@/lib/quickPolls";
import LoginButton from "@/components/LoginButton";
import LogoutButton from "@/components/LogoutButton";
import Ornament from "@/components/ui/Ornament";
import Emblem from "@/components/ui/Emblem";
import CountdownBanner from "@/components/CountdownBanner";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = user ? (await isAdmin(getDiscordId(user))) : false;

  // Für Admins: wie viele Gildennamen-Vorschläge auf Freigabe warten.
  let pendingGuildNames = 0;
  if (admin) {
    const { count } = await createAdminClient()
      .from("guild_name_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "offen");
    pendingGuildNames = count ?? 0;
  }
  const dict = await loadDictionary(await getLocale());

  // Abschnitte, die im Admin-Dashboard ausgeblendet werden können.
  const [decision, countdown, call, privacy, guildName, guildDrafts] = await Promise.all([
    isSectionVisible("home.show.decision"),
    isSectionVisible("home.show.countdown"),
    isSectionVisible("home.show.call"),
    isSectionVisible("home.show.privacy"),
    isSectionVisible("guildName.show"),
    isSectionVisible("guildDrafts.show"),
  ]);
  const show = { decision, countdown, call, privacy, guildName, guildDrafts };

  const quickPolls = await loadQuickPolls(supabase, user?.id ?? null, true);

  return (
    <main className="flex flex-col gap-8">
      <header className="text-center">
        <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
        {/* Kein sichtbarer Titel - die Kopfgrafik übernimmt das. Für
            Screenreader und Suchmaschinen bleibt eine Überschrift erhalten. */}
        <h1 className="sr-only">World of Warcraft Forever</h1>
        <Ornament />
      </header>

      {/* Kurzabstimmungen (Admin-Dashboard) - ganz oben, weil kurzfristig. */}
      {quickPolls.map((poll) => (
        <QuickPollCard key={poll.id} poll={poll} loggedIn={!!user} />
      ))}

      {/* Ankündigung: finale Entscheidung für Horde auf einem PvP-Reich. */}
      {show.decision && (
        <section className="panel relative overflow-hidden border-horde/60 bg-gradient-to-br from-horde-dark/60 via-panel/90 to-panel/90 p-6 text-center">
          <span className="inline-block rounded-full border border-horde px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-red-300">
            {dict.home.decisionTag}
          </span>
          <h2 className="heading-ornate mt-3 text-2xl sm:text-3xl">
            {dict.home.decisionTitle}
          </h2>
          <RichText
            value={dict.home.decisionText}
            className="mx-auto mt-3 max-w-xl leading-relaxed text-parchment/90"
          />
          {show.countdown && (
            <div className="mt-5">
              <CountdownBanner />
            </div>
          )}
        </section>
      )}

      {/* Aufruf: Berufe und Verfügbarkeit für die ersten Wochen eintragen. */}
      {show.call && (
        <section className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="heading-ornate text-xl">{dict.home.callTitle}</h2>
            <RichText
              value={dict.home.callText}
              className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-parchment/85"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CallCard
              title={dict.home.professionsTitle}
              text={dict.home.professionsText}
              button={dict.home.professionsButton}
              href="/umfrage"
              loggedIn={!!user}
            />
            <CallCard
              title={dict.home.availabilityTitle}
              text={dict.home.availabilityText}
              button={dict.home.availabilityButton}
              href="/verfuegbarkeit"
              loggedIn={!!user}
            />
          </div>
        </section>
      )}

      <section className="panel p-6">
        {user ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-300">
              {dict.nav.loggedInAs}{" "}
              <strong className="text-gold-light">
                {user.user_metadata?.full_name ?? user.user_metadata?.name}
              </strong>
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/uebersicht"
                className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
              >
                {dict.nav.toOverview}
              </Link>
              {(show.guildDrafts || admin) && (
                <Link
                  href="/fraktionen"
                  className="rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-2 font-medium text-ink transition hover:brightness-110"
                >
                  {dict.nav.toFactions}
                  {!show.guildDrafts && (
                    <span className="ml-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-slate-200">
                      {dict.guildName.admin.hiddenBadge}
                    </span>
                  )}
                </Link>
              )}
              {(show.guildName || admin) && (
                <Link
                  href="/gildenname"
                  className="rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-2 font-medium text-ink transition hover:brightness-110"
                >
                  {dict.nav.toGuildName}
                  {!show.guildName && (
                    <span className="ml-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-slate-200">
                      {dict.guildName.admin.hiddenBadge}
                    </span>
                  )}
                  {pendingGuildNames > 0 && (
                    <span className="ml-2 rounded-full bg-horde px-2 py-0.5 text-xs text-white">
                      {formatPending(dict, pendingGuildNames)}
                    </span>
                  )}
                </Link>
              )}
              <Link
                href="/termine"
                className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
              >
                {dict.nav.toEvents}
              </Link>
              <Link
                href="/charaktere"
                className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
              >
                {dict.nav.toCharacters}
              </Link>
              <Link
                href="/downloads"
                className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
              >
                {dict.nav.toDownloads}
              </Link>
              {admin && (
                <Link
                  href="/admin"
                  className="rounded-lg border border-horde/60 px-4 py-2 font-medium text-horde transition hover:bg-horde/10"
                >
                  {dict.nav.toAdmin}
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-slate-300">{dict.nav.loginPrompt}</p>
            <div className="w-full max-w-xs">
              <LoginButton />
            </div>
          </div>
        )}
      </section>

      {show.privacy && (
        <section className="panel p-5 text-sm text-slate-400">
          <h2 className="mb-2 font-heading text-base text-gold-light">
            {dict.home.privacyTitle}
          </h2>
          <RichText value={dict.home.privacyText} />
        </section>
      )}
    </main>
  );
}

// Karte für den Aufruf auf der Startseite. Ohne Login führt der Button
// nicht weiter (die Zielseiten erfordern einen Login) - dann steht dort
// stattdessen der Login-Hinweis darunter.
function CallCard({
  title,
  text,
  button,
  href,
  loggedIn,
}: {
  title: string;
  text: string;
  button: string;
  href: string;
  loggedIn: boolean;
}) {
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h3 className="font-heading text-base text-gold-light">{title}</h3>
      <RichText value={text} className="flex-1 text-sm leading-relaxed text-slate-300" />
      {loggedIn && (
        <Link
          href={href}
          className="self-start rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-2 font-medium text-ink transition hover:brightness-110"
        >
          {button}
        </Link>
      )}
    </div>
  );
}
