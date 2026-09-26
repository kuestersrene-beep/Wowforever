import type { ParticipantSummary } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import { formatClassConflict, formatPrio } from "@/lib/i18n/format";
import { EmptyState } from "./FactionChart";

interface ClassPick {
  name: string;
  priority: number;
}

export default function ClassPriorityOverview({
  responses,
  dict,
}: {
  responses: ParticipantSummary[];
  dict: Dictionary;
}) {
  const byClass = new Map<string, ClassPick[]>();

  responses.forEach((r) => {
    r.classes?.forEach((cls, idx) => {
      const picks = byClass.get(cls) ?? [];
      picks.push({ name: r.first_name || r.display_name, priority: idx + 1 });
      byClass.set(cls, picks);
    });
  });

  const classes = Array.from(byClass.entries())
    .map(([cls, picks]) => ({
      cls,
      picks: picks.sort((a, b) => a.priority - b.priority),
    }))
    .sort((a, b) => b.picks.length - a.picks.length);

  return (
    <div className="panel p-4">
      <h3 className="mb-1 font-heading text-gold-light">
        {dict.admin.classPriority.title}
      </h3>
      <p className="mb-3 text-xs text-slate-400">
        {dict.admin.classPriority.hint}
      </p>
      {classes.length === 0 ? (
        <EmptyState dict={dict} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map(({ cls, picks }) => {
            const firstChoiceCount = picks.filter(
              (p) => p.priority === 1
            ).length;
            return (
              <div
                key={cls}
                className="rounded-lg border border-gold/20 bg-ink/40 p-3"
              >
                <p className="font-medium text-parchment">
                  {dict.labels.class[cls] ?? cls}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-300">
                  {picks.map((p, i) => (
                    <li key={`${p.name}-${i}`}>
                      {p.name}{" "}
                      <span className="text-slate-500">
                        ({formatPrio(dict, p.priority)})
                      </span>
                    </li>
                  ))}
                </ul>
                {firstChoiceCount > 1 && (
                  <p className="mt-1 text-xs text-gold-light">
                    {formatClassConflict(dict, firstChoiceCount)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
