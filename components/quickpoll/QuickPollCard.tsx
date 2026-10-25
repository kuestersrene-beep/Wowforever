"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeQuickPollVote, voteQuickPoll } from "@/app/kurzabstimmung/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { formatVotes } from "@/lib/i18n/format";
import type { QuickPollResult } from "@/lib/types";

// Kurzabstimmung auf der Startseite. Ein Klick auf eine Antwort gibt die
// Stimme ab bzw. verschiebt sie; die Ergebnisse sieht man, sobald man
// abgestimmt hat.
export default function QuickPollCard({
  poll,
  loggedIn,
}: {
  poll: QuickPollResult;
  loggedIn: boolean;
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const showResults = poll.myVote !== null;

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  return (
    <section className="panel border-gold/60 bg-gradient-to-br from-gold/10 via-panel/90 to-panel/90 p-6">
      <div className="text-center">
        <span className="inline-block rounded-full border border-gold/70 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-gold-light">
          {dict.quickPoll.tag}
        </span>
        <h2 className="heading-ornate mt-3 text-xl sm:text-2xl">{poll.question}</h2>
      </div>

      <ul className="mx-auto mt-5 flex max-w-xl flex-col gap-2">
        {poll.options.map((option) => {
          const mine = poll.myVote === option.id;
          const percent =
            poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!loggedIn || isPending}
                onClick={() =>
                  run(() =>
                    mine
                      ? removeQuickPollVote(poll.id)
                      : voteQuickPoll(poll.id, option.id)
                  )
                }
                title={mine ? dict.quickPoll.removeVote : undefined}
                className={`relative w-full overflow-hidden rounded-lg border px-4 py-3 text-left transition disabled:cursor-default ${
                  mine
                    ? "border-gold bg-gold/10"
                    : "border-gold/30 hover:border-gold/70 hover:bg-gold/5"
                }`}
              >
                {showResults && (
                  <span
                    className={`absolute inset-y-0 left-0 ${mine ? "bg-gold/30" : "bg-gold/10"}`}
                    style={{ width: `${percent}%` }}
                    aria-hidden="true"
                  />
                )}
                <span className="relative flex items-center justify-between gap-3">
                  <span className="font-medium text-parchment">
                    {mine && "✓ "}
                    {option.label}
                  </span>
                  {showResults && (
                    <span className="whitespace-nowrap text-sm text-slate-300">
                      {percent} % · {formatVotes(dict, option.votes)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-center text-xs text-slate-400">
        {!loggedIn
          ? dict.quickPoll.loginHint
          : showResults
            ? dict.quickPoll.changeHint
            : dict.quickPoll.voteHint}
      </p>
    </section>
  );
}
