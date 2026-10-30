import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { isSectionVisible, loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import WowTooltipBox from "@/components/factions/WowTooltipBox";
import ActivateFactionButton from "@/components/factions/ActivateFactionButton";
import Emblem from "@/components/ui/Emblem";
import type { GuildDraft } from "@/lib/types";

export default async function FraktionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  const { data: draft } = await supabase
    .from("guild_drafts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<GuildDraft>();

  if (!draft) {
    notFound();
  }

  const t = dict.guildDrafts;
  const infoLines = [
    draft.sitz && { label: t.sitzLabel, value: draft.sitz },
    draft.anfuehrer && { label: t.anfuehrerLabel, value: draft.anfuehrer },
    draft.feinde && { label: t.feindeLabel, value: draft.feinde },
    draft.primaerwert && { label: t.primaerwertLabel, value: draft.primaerwert },
  ].filter((l): l is { label: string; value: string } => !!l);

  const gallery = [
    draft.crest_url,
    draft.tabard_url,
    draft.banner_url,
  ].filter((u): u is string => !!u);

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-14 w-14" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-ornate text-2xl">{draft.name}</h1>
          {draft.tagline && <p className="text-sm text-gold-light">{draft.tagline}</p>}
        </div>
        <Link href="/fraktionen" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>

      {draft.active && (
        <span className="self-start rounded-full bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-400">
          {t.active}
        </span>
      )}
      {!draft.active && admin && <ActivateFactionButton id={draft.id} />}

      {draft.summary && <p className="text-parchment/90">{draft.summary}</p>}

      {infoLines.length > 0 && (
        <dl className="panel grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          {infoLines.map((l) => (
            <div key={l.label} className="flex gap-2">
              <dt className="text-slate-500">{l.label}:</dt>
              <dd className="text-parchment">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {draft.core_figures.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-slate-400">{t.coreFiguresLabel}</p>
          <div className="flex flex-wrap gap-3">
            {draft.core_figures.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-2 rounded-full border border-gold/30 bg-ink/60 px-3 py-1.5 text-sm"
              >
                <span className="text-base">{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {draft.lore_html && (
        <section className="panel p-5">
          <h2 className="font-heading text-lg text-gold-light">{t.loreTitle}</h2>
          <RichText value={draft.lore_html} className="mt-2 leading-relaxed" />
        </section>
      )}

      {gallery.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {gallery.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={draft.name}
              className="w-full rounded-lg border border-gold/30 object-contain"
            />
          ))}
        </div>
      )}

      {(draft.tooltip_title || draft.tooltip_html) && (
        <div className="flex justify-center">
          <WowTooltipBox
            title={draft.tooltip_title}
            html={draft.tooltip_html}
            hint={t.tooltipHint}
          />
        </div>
      )}

      {draft.rank_structure_html && (
        <section className="panel p-5">
          <h2 className="font-heading text-lg text-gold-light">{t.rankStructureTitle}</h2>
          <RichText value={draft.rank_structure_html} className="mt-2 leading-relaxed" />
        </section>
      )}
    </main>
  );
}
