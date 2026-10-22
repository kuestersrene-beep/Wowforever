import { Fragment, type ReactNode } from "react";
import { CLASS_COLORS, PROFESSION_ICONS } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n/types";
import type { ParticipantSummary } from "@/lib/types";

// Fügt " · " zwischen die vorhandenen (nicht-null) Teile ein.
function joinWithDot(parts: (ReactNode | null)[]): ReactNode[] {
  const present = parts.filter((p): p is ReactNode => p !== null);
  return present.map((part, i) => (
    <span key={i} className="inline-flex items-center gap-1">
      {i > 0 && <span className="text-slate-600">·</span>}
      {part}
    </span>
  ));
}

export default function ParticipantSummaryLine({
  p,
  dict,
}: {
  p: ParticipantSummary;
  dict: Dictionary;
}) {
  // Fraktion und Spielstil sind final entschieden (Horde, PvP) und für
  // alle gleich - deshalb hier nicht mehr pro Person angezeigt.
  const classesNode =
    p.classes && p.classes.length > 0 ? (
      <span className="inline-flex flex-wrap items-center gap-1">
        {p.classes.map((c, i) => (
          <Fragment key={c}>
            {i > 0 && <span className="text-slate-600">→</span>}
            <span style={{ color: CLASS_COLORS[c] }} className="font-medium">
              {dict.labels.class[c] ?? c}
            </span>
          </Fragment>
        ))}
      </span>
    ) : null;

  const roleNode = p.role ? <span>{dict.labels.role[p.role]}</span> : null;

  const left = joinWithDot([classesNode, roleNode]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-400">
      <p className="flex flex-wrap items-center gap-1">
        {left.length > 0 ? left : "–"}
      </p>
      {p.professions && p.professions.length > 0 && (
        <p className="flex items-center gap-3">
          {p.professions.map((prof) => (
            <span key={prof} className="inline-flex items-center gap-1 whitespace-nowrap">
              <span aria-hidden="true">{PROFESSION_ICONS[prof] ?? "🔧"}</span>
              {dict.labels.profession[prof] ?? prof}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
