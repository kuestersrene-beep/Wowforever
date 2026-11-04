import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrl, getDiscordId, getDisplayName, isAdmin } from "@/lib/admin";
import { hasGoldRadarAccess } from "@/lib/goldRadar";
import type { Dictionary } from "@/lib/i18n/types";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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
  const items: NavItem[] = [
    { href: "/", label: t.home },
    ...(user
      ? [
          { href: "/termine", label: t.events },
          { href: "/charaktere", label: t.roster },
          { href: "/uebersicht", label: t.professions },
        ]
      : []),
    ...(goldRadar ? [{ href: "/gold-radar", label: t.goldRadar }] : []),
    { href: "/guides", label: t.guides },
    ...(admin ? [{ href: "/admin", label: t.admin }] : []),
  ];
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const avatar = user ? getAvatarUrl(user) : null;
  const name = user ? getDisplayName(user) : "";

  return (
    <header className="border-b border-line bg-ink/95">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 text-parchment">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GUILD_CREST} alt="" className="h-12 w-11 object-contain" />
          <span className="font-heading text-xl font-bold tracking-[0.08em]">{GUILD_NAME.toUpperCase()}</span>
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
              {t.apply}
            </a>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/charaktere"
                className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 text-sm text-parchment"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-line font-semibold">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[10rem] truncate">{name}</span>
              </Link>
              <LogoutButton />
            </div>
          ) : (
            <LoginButton compact label={t.login} />
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
