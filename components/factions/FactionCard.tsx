"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/types";
import type { GuildDraft } from "@/lib/types";
import ActivateFactionButton from "./ActivateFactionButton";
import WowTooltipBox from "./WowTooltipBox";

type Tab = "lore" | "wappen" | "rang";

// lore_html/rank_structure_html kommen bereits sanitisiert aus der DB
// (sanitizeRichHtml beim Speichern in app/fraktionen/actions.ts) und
// werden hier direkt gerendert statt über <RichText>, damit diese
// Client Component nicht das "sanitize-html"-Paket mit ins
// Browser-Bundle zieht - nur Admins schreiben diese Felder.

// Eine Fraktions-Karte, die ALLE Infos trägt (statt Karte + separater
// Seite): Klick auf "Mehr erfahren" klappt sie an Ort und Stelle auf,
// mit internen Reitern. Bilder zeigen einen Ausschnitt
// (object-fit: cover) und öffnen per Klick eine Lightbox in voller
// Auflösung.
export default function FactionCard({
  draft,
  dict,
  admin,
}: {
  draft: GuildDraft;
  dict: Dictionary;
  admin: boolean;
}) {
  const t = dict.guildDrafts;
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("lore");
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);

  const infoLines = [
    draft.sitz && { label: t.sitzLabel, value: draft.sitz },
    draft.anfuehrer && { label: t.anfuehrerLabel, value: draft.anfuehrer },
    draft.feinde && { label: t.feindeLabel, value: draft.feinde },
    draft.primaerwert && { label: t.primaerwertLabel, value: draft.primaerwert },
  ].filter((l): l is { label: string; value: string } => !!l);

  const gallery = [
    draft.crest_url && { url: draft.crest_url, label: "Wappen" },
    draft.tabard_url && { url: draft.tabard_url, label: "Wappenrock" },
    draft.banner_url && { url: draft.banner_url, label: "Banner" },
  ].filter((g): g is { url: string; label: string } => !!g);

  const hasLore = !!draft.lore_html;
  const hasWappen = gallery.length > 0 || draft.tooltip_title || draft.tooltip_html;
  const hasRang = !!draft.rank_structure_html;
  const hasExpandContent = hasLore || hasWappen || hasRang;

  // Falls der aktuelle Tab keinen Inhalt hat (z. B. kein Lore-Text
  // hinterlegt), auf den ersten vorhandenen Tab ausweichen.
  const activeTab: Tab = (tab === "lore" && hasLore) || (tab === "wappen" && hasWappen) || (tab === "rang" && hasRang)
    ? tab
    : hasLore
      ? "lore"
      : hasWappen
        ? "wappen"
        : "rang";

  return (
    <div
      className={`panel flex flex-col overflow-hidden ${
        draft.active ? "border-gold ring-1 ring-gold" : "border-gold/20"
      }`}
    >
      {draft.image_url ? (
        <button
          type="button"
          onClick={() => setLightbox({ url: draft.image_url!, alt: draft.name })}
          className="block h-32 w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.image_url} alt={draft.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="h-32 w-full bg-ink/40" />
      )}

      <div className="flex flex-col gap-3 p-5">
        <div className="text-center">
          <h3 className="font-heading text-lg text-parchment">{draft.name}</h3>
          {draft.tagline && <p className="text-sm text-gold-light">{draft.tagline}</p>}
        </div>

        {draft.summary && (
          <p className="text-center text-sm text-slate-300">{draft.summary}</p>
        )}

        {infoLines.length > 0 && (
          <dl className="flex flex-col gap-0.5 text-xs text-slate-400">
            {infoLines.map((l) => (
              <div key={l.label} className="flex gap-1">
                <dt className="text-slate-500">{l.label}:</dt>
                <dd className="flex-1 truncate">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {draft.core_figures.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-slate-500">{t.coreFiguresLabel}</p>
            <div className="flex gap-2">
              {draft.core_figures.map((f, i) => (
                <span
                  key={i}
                  title={f.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/30 bg-ink/60 text-base"
                >
                  {f.icon}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2 pt-1">
          {draft.active && <span className="text-sm font-medium text-emerald-400">{t.active}</span>}
          {!draft.active && admin && <ActivateFactionButton id={draft.id} />}
          {hasExpandContent && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full rounded-lg border border-gold/50 px-4 py-2 text-sm font-medium text-gold-light transition hover:bg-gold/10"
            >
              {expanded ? `${t.expand} ↑` : `${t.expand} ↓`}
            </button>
          )}
        </div>
      </div>

      {hasExpandContent && (
        <div
          className="grid border-t border-gold/15 transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 p-5 pt-4">
              <div className="flex gap-1 border-b border-gold/20">
                {hasLore && (
                  <TabButton active={activeTab === "lore"} onClick={() => setTab("lore")}>
                    {t.loreTitle}
                  </TabButton>
                )}
                {hasWappen && (
                  <TabButton active={activeTab === "wappen"} onClick={() => setTab("wappen")}>
                    {t.tooltipHint}
                  </TabButton>
                )}
                {hasRang && (
                  <TabButton active={activeTab === "rang"} onClick={() => setTab("rang")}>
                    {t.rankStructureTitle}
                  </TabButton>
                )}
              </div>

              {activeTab === "lore" && hasLore && (
                <div
                  className="rich-text text-sm leading-relaxed text-parchment/90"
                  dangerouslySetInnerHTML={{ __html: draft.lore_html! }}
                />
              )}

              {activeTab === "wappen" && hasWappen && (
                <div className="flex flex-col gap-3">
                  {gallery.length > 0 && (
                    <div className="flex gap-2">
                      {gallery.map((g) => (
                        <button
                          key={g.url}
                          type="button"
                          onClick={() => setLightbox({ url: g.url, alt: g.label })}
                          className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gold/30"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.url} alt={g.label} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                  {(draft.tooltip_title || draft.tooltip_html) && (
                    <WowTooltipBox
                      title={draft.tooltip_title}
                      html={draft.tooltip_html}
                      hint={t.tooltipHint}
                    />
                  )}
                </div>
              )}

              {activeTab === "rang" && hasRang && (
                <div
                  className="rich-text text-sm leading-relaxed text-parchment/90"
                  dangerouslySetInnerHTML={{ __html: draft.rank_structure_html! }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-2.5 py-1.5 text-xs transition ${
        active
          ? "border-gold text-gold-light"
          : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
