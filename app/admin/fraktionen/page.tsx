import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import GuildDraftManager from "@/components/admin/GuildDraftManager";
import type { GuildDraft } from "@/lib/types";

export default async function AdminFraktionenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(getDiscordId(user)))) {
    redirect("/");
  }

  const dict = await loadDictionary(await getLocale());

  const { data } = await createAdminClient()
    .from("guild_drafts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<GuildDraft[]>();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.guildDrafts.admin.manageLink}</h1>
        <Link href="/admin" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="text-sm text-slate-400">{dict.guildDrafts.admin.manageHint}</p>
      <GuildDraftManager drafts={data ?? []} dict={dict} />
    </main>
  );
}
