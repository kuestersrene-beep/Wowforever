import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/types";
import type { GuildDraft } from "@/lib/types";
import ActivateFactionButton from "./ActivateFactionButton";

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
  const infoLines = [
    draft.sitz && { label: t.sitzLabel, value: draft.sitz },
    draft.anfuehrer && { label: t.anfuehrerLabel, value: draft.anfuehrer },
    draft.feinde && { label: t.feindeLabel, value: draft.feinde },
    draft.primaerwert && { label: t.primaerwertLabel, value: draft.primaerwert },
  ].filter((l): l is { label: string; value: string } => !!l);

  return (
    <div
      className={`panel flex flex-col gap-3 p-5 ${
        draft.active ? "border-gold ring-1 ring-gold" : "border-gold/20"
      }`}
    >
      {draft.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.image_url}
          alt={draft.name}
          className="h-28 w-full rounded-lg border border-gold/30 object-cover"
        />
      ) : (
        <div className="h-28 w-full rounded-lg border border-gold/20 bg-ink/40" />
      )}

      <div className="text-center">
        <h3 className="font-heading text-lg text-parchment">{draft.name}</h3>
        {draft.tagline && (
          <p className="text-sm text-gold-light">{draft.tagline}</p>
        )}
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

      <div className="mt-auto flex flex-col items-center gap-2 pt-2">
        {draft.active ? (
          <>
            <span className="text-sm font-medium text-emerald-400">{t.active}</span>
            <Link
              href={`/fraktionen/${draft.slug}`}
              className="text-sm text-gold-light underline-offset-2 hover:underline"
            >
              {t.expand}
            </Link>
          </>
        ) : admin ? (
          <ActivateFactionButton id={draft.id} />
        ) : (
          <Link
            href={`/fraktionen/${draft.slug}`}
            className="text-sm text-gold-light underline-offset-2 hover:underline"
          >
            {t.expand}
          </Link>
        )}
      </div>
    </div>
  );
}
