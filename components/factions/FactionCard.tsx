"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/types";
import type { GuildDraft } from "@/lib/types";
import ActivateFactionButton from "./ActivateFactionButton";
import TabardIcon from "./TabardIcon";

// lore_html/rank_structure_html kommen bereits sanitisiert aus der DB
// (sanitizeRichHtml beim Speichern in app/fraktionen/actions.ts) und
// werden hier direkt gerendert statt über <RichText>, damit diese
// Client Component nicht das "sanitize-html"-Paket mit ins
// Browser-Bundle zieht - nur Admins schreiben diese Felder.

// Eine Fraktions-Karte, die ALLE Infos trägt: Lore, das komplette
// Wappenrock-Stylesheet und die Rangstruktur stehen direkt
// untereinander auf der Karte (keine Reiter, kein Auf-/Zuklappen -
// genug Breite seit dem breiteren Layout). Bilder öffnen per Klick
// eine Lightbox in voller Auflösung.
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
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);

  const infoLines = [
    draft.sitz && { label: t.sitzLabel, value: draft.sitz },
    draft.anfuehrer && { label: t.anfuehrerLabel, value: draft.anfuehrer },
    draft.feinde && { label: t.feindeLabel, value: draft.feinde },
    draft.primaerwert && { label: t.primaerwertLabel, value: draft.primaerwert },
  ].filter((l): l is { label: string; value: string } => !!l);

  // Für das Hover-Icon bevorzugt das eigens ausgeschnittene quadratische
  // Item-Icon, sonst Fallback auf das große Wappenrock-Bild.
  const tabardIconUrl = draft.tabard_icon_url ?? draft.tabard_url;

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
          className="block h-40 w-full cursor-zoom-in sm:h-56 lg:h-72"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.image_url} alt={draft.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="h-40 w-full bg-ink/40 sm:h-56 lg:h-72" />
      )}

      <div className="flex flex-col gap-4 p-6">
        <div className="text-center">
          <h3 className="font-heading text-2xl text-parchment">{draft.name}</h3>
          {draft.tagline && <p className="mt-1 text-base text-gold-light">{draft.tagline}</p>}
        </div>

        {draft.summary && (
          <p className="text-center text-base text-slate-300">{draft.summary}</p>
        )}

        {infoLines.length > 0 && (
          <dl className="mx-auto flex flex-col gap-1 text-sm text-slate-400">
            {infoLines.map((l) => (
              <div key={l.label} className="flex gap-1">
                <dt className="text-slate-500">{l.label}:</dt>
                <dd className="flex-1">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(draft.core_figures.length > 0 || tabardIconUrl) && (
          <div className="flex flex-col items-center gap-4">
            {draft.core_figures.length > 0 && (
              <div className="text-center">
                <p className="mb-1 text-xs text-slate-500">{t.coreFiguresLabel}</p>
                <div className="flex justify-center gap-2">
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
            {tabardIconUrl && (
              <div className="text-center">
                <p className="mb-1 text-xs text-slate-500">{t.tabardLabel}</p>
                <div className="flex justify-center">
                  <TabardIcon
                    tabardUrl={tabardIconUrl}
                    alt={draft.name}
                    title={draft.tooltip_title}
                    meta={draft.tooltip_meta}
                    effects={draft.tooltip_effects}
                    quote={draft.tooltip_quote}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {(draft.active || (!draft.active && admin)) && (
          <div className="flex flex-col items-center gap-2 pt-1">
            {draft.active && <span className="text-sm font-medium text-emerald-400">{t.active}</span>}
            {!draft.active && admin && <ActivateFactionButton id={draft.id} />}
          </div>
        )}
      </div>

      {(draft.lore_html || draft.stylesheet_url || draft.rank_structure_html) && (
        <div className="flex flex-col gap-6 border-t border-gold/15 p-6 pt-5">
          {draft.lore_html && (
            <div>
              <h4 className="mb-2 font-heading text-lg text-gold-light">{t.loreTitle}</h4>
              <div
                className="rich-text text-base leading-relaxed text-parchment/90"
                dangerouslySetInnerHTML={{ __html: draft.lore_html }}
              />
            </div>
          )}

          {draft.stylesheet_url && (
            <div>
              <h4 className="mb-2 font-heading text-lg text-gold-light">{t.tabardLabel}</h4>
              <button
                type="button"
                onClick={() => setLightbox({ url: draft.stylesheet_url!, alt: draft.name })}
                className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-gold/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.stylesheet_url}
                  alt={draft.name}
                  className="w-full object-contain"
                />
              </button>
            </div>
          )}

          {draft.rank_structure_html && (
            <div>
              <h4 className="mb-2 font-heading text-lg text-gold-light">{t.rankStructureTitle}</h4>
              <div
                className="rich-text text-base leading-relaxed text-parchment/90"
                dangerouslySetInnerHTML={{ __html: draft.rank_structure_html }}
              />
            </div>
          )}
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
