import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import FactionCard from "@/components/factions/FactionCard";
import Emblem from "@/components/ui/Emblem";
import type { GuildDraft } from "@/lib/types";

export default async function FraktionenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const admin = await isAdmin(getDiscordId(user));

  const visible = await isSectionVisible("guildDrafts.show");
  if (!visible && !admin) {
    redirect("/");
  }

  const dict = await loadDictionary(await getLocale());

  const { data } = await supabase
    .from("guild_drafts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<GuildDraft[]>();

  const drafts = data ?? [];

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.guildDrafts.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <RichText
        value={dict.guildDrafts.hint}
        className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90"
      />

      {drafts.length === 0 ? (
        <p className="panel p-4 text-center text-sm text-slate-500">
          {dict.guildDrafts.empty}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((d) => (
            <FactionCard key={d.id} draft={d} dict={dict} admin={admin} />
          ))}
        </div>
      )}
    </main>
  );
}
