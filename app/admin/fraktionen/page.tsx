import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import GuildDraftManager from "@/components/admin/GuildDraftManager";
import type { GuildDraft, GuildDraftVoteAdminRow } from "@/lib/types";

export default async function AdminFraktionenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(getDiscordId(user)))) {
    redirect("/");
  }

  const dict = await loadDictionary(await getLocale());

  const adminSupabase = createAdminClient();

  const { data } = await adminSupabase
    .from("guild_drafts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<GuildDraft[]>();

  const drafts = data ?? [];

  // Private Stimmen - nur hier im Admin-Dashboard sichtbar (service_role,
  // umgeht RLS). Mit Anzeige-Infos aus "responses" angereichert.
  const { data: votes } = await adminSupabase
    .from("guild_draft_votes")
    .select("user_id, draft_id");

  const { data: responses } = await adminSupabase
    .from("responses")
    .select("user_id, display_name, first_name");

  const responseByUser = new Map((responses ?? []).map((r) => [r.user_id, r]));

  const voteRows: GuildDraftVoteAdminRow[] = (votes ?? []).map((v) => {
    const r = responseByUser.get(v.user_id);
    return {
      user_id: v.user_id,
      draft_id: v.draft_id,
      display_name: r?.display_name ?? v.user_id,
      first_name: r?.first_name ?? null,
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.guildDrafts.admin.manageLink}</h1>
        <Link href="/admin" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="text-sm text-slate-400">{dict.guildDrafts.admin.manageHint}</p>
      <GuildDraftManager drafts={drafts} dict={dict} />

      <div className="panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-heading text-lg text-gold-light">{dict.guildDrafts.admin.votesTitle}</h2>
          <p className="mt-1 text-sm text-slate-400">{dict.guildDrafts.admin.votesHint}</p>
        </div>

        {voteRows.length === 0 ? (
          <p className="text-sm text-slate-500">{dict.guildDrafts.admin.noVotes}</p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
            {drafts.map((d) => {
              const rows = voteRows.filter((v) => v.draft_id === d.id);
              return (
                <div key={d.id} className="flex-1">
                  <h3 className="font-heading text-base text-parchment">
                    {d.name} <span className="text-sm text-slate-500">({rows.length})</span>
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-300">
                    {rows.map((r) => (
                      <li key={r.user_id}>{r.first_name ?? r.display_name}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
