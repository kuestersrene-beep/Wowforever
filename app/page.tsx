import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatCountdown } from "@/lib/i18n/format";
import LoginButton from "@/components/LoginButton";
import LogoutButton from "@/components/LogoutButton";
import Ornament from "@/components/ui/Ornament";
import Emblem from "@/components/ui/Emblem";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = user ? isAdmin(getDiscordId(user)) : false;
  const dict = getDictionary(await getLocale());

  let daysUntilLaunch: number | null = null;
  if (process.env.NEXT_PUBLIC_LAUNCH_DATE) {
    const launch = new Date(process.env.NEXT_PUBLIC_LAUNCH_DATE);
    const today = new Date();
    launch.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    daysUntilLaunch = Math.round(
      (launch.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return (
    <main className="flex flex-col gap-8">
      <header className="text-center">
        <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
        <h1 className="heading-ornate mt-3 text-3xl sm:text-4xl">
          World of Warcraft Forever
        </h1>
        <Ornament />
        <blockquote className="mx-auto mt-4 max-w-md border-l-2 border-gold/50 pl-4 text-left italic leading-relaxed text-parchment/90">
          {dict.home.quest}
        </blockquote>
        <p className="mt-4 text-slate-300">{dict.home.subtitle}</p>
        {daysUntilLaunch !== null && daysUntilLaunch > 0 && (
          <p className="mt-3 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1 text-sm text-gold-light">
            {formatCountdown(dict, daysUntilLaunch)}
          </p>
        )}
        {daysUntilLaunch === 0 && (
          <p className="mt-3 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1 text-sm text-gold-light">
            {dict.home.countdownToday}
          </p>
        )}
      </header>

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
