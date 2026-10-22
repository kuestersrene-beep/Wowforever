"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGuildName,
  removeGuildNameVote,
  voteGuildName,
} from "@/app/gildenname/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { formatVotes } from "@/lib/i18n/format";
import type { GuildNameSuggestion } from "@/lib/types";

type PollEntry = GuildNameSuggestion & { votes: number };

// Freigegebene Namen mit Stimmen-Balken, sortiert nach Stimmen. Eine
// Stimme pro Person - ein Klick auf einen anderen Namen verschiebt sie.
export default function GuildNamePoll({
  suggestions,
  myVote,
  admin,
}: {
  suggestions: PollEntry[];
  myVote: string | null;
  admin: boolean;
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const total = suggestions.reduce((sum, s) => sum + s.votes, 0);
  const sorted = suggestions
    .slice()
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg text-gold-light">{dict.guildName.pollTitle}</h2>
      {sorted.length === 0 ? (
        <p className="panel p-4 text-center text-sm text-slate-500">
          {dict.guildName.pollEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((s) => {
            const mine = myVote === s.id;
            const percent = total > 0 ? Math.round((s.votes / total) * 100) : 0;
            return (
              <li
                key={s.id}
                className={`panel relative overflow-hidden p-3 ${
                  mine ? "border-horde/70" : ""
                }`}
              >
                {/* Stimmen-Balken als Hintergrund */}
                <div
                  className={`absolute inset-y-0 left-0 ${mine ? "bg-horde/25" : "bg-gold/10"}`}
                  style={{ width: `${percent}%` }}
                  aria-hidden="true"
                />
                <div className="relative flex flex-wrap items-center gap-3">
                  <div className="flex-1">
                    <p className="font-heading text-base text-parchment">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {dict.guildName.suggestedBy} {s.display_name}
                    </p>
                  </div>
                  <span className="text-sm text-slate-300">
                    {formatVotes(dict, s.votes)}
                    {total > 0 && <span className="text-slate-500"> · {percent} %</span>}
                  </span>
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => run(() => removeGuildNameVote())}
                      disabled={isPending}
                      title={dict.guildName.removeVote}
                      className="rounded-lg border border-horde bg-horde/30 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-horde/40 disabled:opacity-50"
                    >
                      ✓ {dict.guildName.yourVote}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => run(() => voteGuildName(s.id))}
                      disabled={isPending}
                      className="rounded-lg border border-gold/60 px-3 py-1.5 text-sm font-medium text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
                    >
                      {dict.guildName.vote}
                    </button>
                  )}
                  {admin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm(dict.guildName.admin.deleteConfirm)) return;
                        run(() => deleteGuildName(s.id));
                      }}
                      disabled={isPending}
                      className="text-xs text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {dict.guildName.admin.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
