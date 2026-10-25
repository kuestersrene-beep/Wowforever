import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import GuildNamePoll from "@/components/guildname/GuildNamePoll";
import SuggestGuildNameForm from "@/components/guildname/SuggestGuildNameForm";
import GuildNameAdminQueue from "@/components/guildname/GuildNameAdminQueue";
import Emblem from "@/components/ui/Emblem";
import type { GuildNameSuggestion } from "@/lib/types";

export default async function GildennamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const admin = (await isAdmin(getDiscordId(user)));

  // Ausgeblendet (Admin-Dashboard -> Texte bearbeiten): nur Admins sehen
  // die Seite, z. B. um Vorschläge vorzubereiten.
  const visible = await isSectionVisible("guildName.show");
  if (!visible && !admin) {
    redirect("/");
  }
  const dict = await loadDictionary(await getLocale());

  // RLS liefert alle freigegebenen Vorschläge plus die eigenen.
  const [{ data: suggestionRows }, { data: voteRows }] = await Promise.all([
    supabase
      .from("guild_name_suggestions")
      .select("*")
      .order("created_at", { ascending: true })
      .returns<GuildNameSuggestion[]>(),
    supabase
      .from("guild_name_votes")
      .select("user_id, suggestion_id")
      .returns<{ user_id: string; suggestion_id: string }[]>(),
  ]);

  const suggestions = suggestionRows ?? [];
  const approved = suggestions.filter((s) => s.status === "freigegeben");
  const mine = suggestions.filter((s) => s.user_id === user.id);

  const votesBySuggestion = new Map<string, number>();
  for (const v of voteRows ?? []) {
    votesBySuggestion.set(v.suggestion_id, (votesBySuggestion.get(v.suggestion_id) ?? 0) + 1);
  }
  const myVote = (voteRows ?? []).find((v) => v.user_id === user.id)?.suggestion_id ?? null;

  // Admins sehen zusätzlich alle offenen und abgelehnten Vorschläge.
  let pending: GuildNameSuggestion[] = [];
  let rejected: GuildNameSuggestion[] = [];
  if (admin) {
    const { data } = await createAdminClient()
      .from("guild_name_suggestions")
      .select("*")
      .in("status", ["offen", "abgelehnt"])
      .order("created_at", { ascending: true })
      .returns<GuildNameSuggestion[]>();
    pending = (data ?? []).filter((s) => s.status === "offen");
    rejected = (data ?? []).filter((s) => s.status === "abgelehnt");
  }

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.guildName.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <RichText
        value={dict.guildName.hint}
        className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90"
      />

      {admin && !visible && (
        <p className="rounded-lg border border-horde/60 bg-horde-dark/40 px-4 py-2 text-sm text-red-200">
          {dict.guildName.admin.hiddenHint}
        </p>
      )}

      {admin && (
        <GuildNameAdminQueue pending={pending} rejected={rejected} />
      )}

      <GuildNamePoll
        suggestions={approved.map((s) => ({
          ...s,
          votes: votesBySuggestion.get(s.id) ?? 0,
        }))}
        myVote={myVote}
        admin={admin}
      />

      <SuggestGuildNameForm mine={mine} />
    </main>
  );
}
