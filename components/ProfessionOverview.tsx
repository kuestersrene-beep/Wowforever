import { PROFESSION_ICONS, WOW_PROFESSIONS } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n/types";
import type { ParticipantSummary } from "@/lib/types";

// Wer hat welchen Beruf gewählt? Zeigt alle Berufe - auch die, die noch
// niemand gewählt hat, damit Lücken sofort auffallen.
export default function ProfessionOverview({
  responses,
  dict,
}: {
  responses: ParticipantSummary[];
  dict: Dictionary;
}) {
  const playing = responses.filter((r) => r.participation !== "nein");

  return (
    <div className="panel p-4">
      <h2 className="mb-1 font-heading text-lg text-gold-light">
        {dict.overview.professionsTitle}
      </h2>
      <p className="mb-3 text-xs text-slate-400">{dict.overview.professionsHint}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {WOW_PROFESSIONS.map((prof) => {
          const names = playing
            .filter((r) => r.professions?.includes(prof))
            .map((r) => r.first_name || r.display_name);
          return (
            <div
              key={prof}
              className={`rounded-lg border p-3 ${
                names.length === 0
                  ? "border-dashed border-slate-700 bg-ink/20"
                  : "border-gold/20 bg-ink/40"
              }`}
            >
              <p className="flex items-center justify-between gap-2 font-medium text-parchment">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">{PROFESSION_ICONS[prof] ?? "🔧"}</span>
                  {dict.labels.profession[prof] ?? prof}
                </span>
                <span className="text-xs text-slate-400">{names.length}</span>
              </p>
              <p className="mt-1 text-xs text-slate-300">
                {names.length > 0 ? (
                  names.join(", ")
                ) : (
                  <span className="text-slate-500">{dict.overview.professionMissing}</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
