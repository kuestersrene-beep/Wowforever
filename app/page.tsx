import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getDictionary, getLocale } from "@/lib/i18n";
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

  const admin = user ? isAdmin(getDiscordId(user)) : false;
  const dict = getDictionary(await getLocale());

  return (
    <main className="flex flex-col gap-8">
      <header className="text-center">
        <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
        <h1 className="heading-ornate mt-3 text-3xl sm:text-4xl">
          World of Warcraft Forever
        </h1>
        <Ornament />
        <blockquote className="mx-auto mt-4 flex max-w-md flex-col gap-3 border-l-2 border-gold/50 pl-4 text-left italic leading-relaxed text-parchment/90">
          <p>{dict.home.quest}</p>
          <p>{dict.home.subtitle}</p>
        </blockquote>
        <CountdownBanner />
      </header>

      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <h2 className="heading-ornate text-lg">
          {dict.home.downloadGuide.title}
        </h2>
        <a
          href="https://cdn.discordapp.com/attachments/775355218917195776/1555647131057131572/RXPGuides-v4.11.12.rar?ex=6ac148ca&is=6abff74a&hm=168336108268a5aa6eec0f0ce677ebf9e46a4988ac3269551fcb9597fd7c5521&"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-gold/40 bg-ink/40 p-2 transition hover:border-gold/70 hover:brightness-110"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/rxpguides-download.gif"
            alt={dict.home.downloadGuide.caption}
            width={96}
            height={96}
            className="h-24 w-24"
          />
        </a>
        <p className="font-heading text-sm text-gold-light">
          {dict.home.downloadGuide.caption}
        </p>
      </section>

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
                href="/umfrage"
                className="rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-2 font-medium text-ink transition hover:brightness-110"
              >
                {dict.nav.toSurvey}
              </Link>
              <Link
                href="/uebersicht"
                className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
              >
                {dict.nav.toOverview}
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

      <section className="panel p-5 text-sm text-slate-400">
        <h2 className="mb-2 font-heading text-base text-gold-light">
          {dict.home.privacyTitle}
        </h2>
        <p>{dict.home.privacyText}</p>
      </section>
    </main>
  );
}
