import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrl, getDiscordId, getDisplayName, isAdmin } from "@/lib/admin";
import { hasGoldRadarAccess } from "@/lib/goldRadar";
import type { Dictionary } from "@/lib/i18n/types";
import LoginButton from "@/components/LoginButton";
import LogoutButton from "@/components/LogoutButton";
import NavLinks, { type NavItem } from "@/components/NavLinks";
import { GUILD_CREST, GUILD_NAME } from "@/lib/guild";

// Seitenkopf auf jeder Seite: Wappen, Hauptnavigation, Discord und Profil.
// Bereiche, die einen Login (oder eine Rolle) brauchen, erscheinen erst,
// wenn sie auch nutzbar sind.
export default async function SiteHeader({ dict }: { dict: Dictionary }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user ? getDiscordId(user) : null;
  const [admin, goldRadar] = user
    ? await Promise.all([isAdmin(discordId), hasGoldRadarAccess(discordId)])
    : [false, false];

  const t = dict.menu;
  // Gäste sehen nur die Gildenhalle; alles andere ist für Mitglieder. "Admin" sitzt rechts beim
  // Profil, damit die Navigation auch mit allen Punkten in eine Zeile passt.
  const items: NavItem[] = [
    { href: "/", label: t.home },
    ...(user
      ? [
          { href: "/termine", label: t.events },
          { href: "/charaktere", label: t.roster },
          { href: "/uebersicht", label: t.professions },
          ...(goldRadar ? [{ href: "/gold-radar", label: t.goldRadar }] : []),
          { href: "/guides", label: t.guides },
        ]
      : []),
  ];
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const avatar = user ? getAvatarUrl(user) : null;
  const name = user ? getDisplayName(user) : "";

  return (
    <header className="border-b border-line bg-ink/95">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6">
        <Link href="/" className="flex items-center gap-3 text-parchment">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GUILD_CREST} alt="" className="h-10 w-9 object-contain sm:h-12 sm:w-11" />
          <span className="font-heading text-base font-bold tracking-[0.08em] sm:text-xl">{GUILD_NAME.toUpperCase()}</span>
        </Link>

        {/* Auf schmalen Bildschirmen rutscht die Navigation in eine eigene
            Zeile, Login/Profil bleiben oben rechts in der Ecke. */}
        <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
          <NavLinks items={items} label={t.mainNav} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {invite && !user && (
            <a
              href={invite}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-gold-dark px-4 py-2.5 font-medium text-parchment transition hover:bg-gold/10"
            >
              {t.joinDiscord}
            </a>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              {admin && (
                <Link
                  href="/admin"
                  className="rounded-md border border-amber-soft/50 px-3 py-1.5 text-sm text-amber-soft transition hover:bg-amber-soft/10"
                >
                  {t.admin}
                </Link>
              )}
              <Link
                href="/charaktere"
                aria-label={name}
                className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-1 text-sm text-parchment xl:pr-3"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-line font-semibold">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[9rem] truncate xl:inline">{name}</span>
              </Link>
              <LogoutButton />
            </div>
          ) : (
            <LoginButton compact label={t.login} />
          )}
        </div>
      </div>
    </header>
  );
}
