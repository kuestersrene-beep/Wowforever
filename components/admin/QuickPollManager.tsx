"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQuickPoll,
  deleteQuickPoll,
  setQuickPollActive,
} from "@/app/kurzabstimmung/actions";
import { formatVotes } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/types";
import type { QuickPollResult } from "@/lib/types";

const inputClass =
  "rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none";

// Admin-Dashboard: Kurzabstimmungen anlegen, auf der Startseite
// ein-/ausblenden (aktiv) und löschen. Ergebnisse sieht man hier immer.
export default function QuickPollManager({
  polls,
  dict,
}: {
  polls: QuickPollResult[];
  dict: Dictionary;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const t = dict.quickPoll.admin;

  const run = (fn: () => Promise<void>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onSuccess?.();
        router.refresh();
      } catch {
        setError(t.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {polls.map((poll) => (
          <li key={poll.id} className="panel flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <p className="flex-1 font-medium text-parchment">{poll.question}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  poll.active ? "bg-emerald-950 text-emerald-400" : "bg-slate-800 text-slate-400"
                }`}
              >
                {poll.active ? t.active : t.inactive}
              </span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-slate-300">
              {poll.options.map((o) => (
                <li key={o.id} className="flex justify-between gap-3">
                  <span>{o.label}</span>
                  <span className="text-slate-400">{formatVotes(dict, o.votes)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => setQuickPollActive(poll.id, !poll.active))}
                className="rounded-lg border border-gold/50 px-3 py-1.5 text-sm text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
              >
                {poll.active ? t.deactivate : t.activate}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!confirm(t.deleteConfirm)) return;
                  run(() => deleteQuickPoll(poll.id));
                }}
                className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {t.delete}
              </button>
            </div>
          </li>
        ))}
        {polls.length === 0 && (
          <li className="panel p-4 text-center text-sm text-slate-500">{t.empty}</li>
        )}
      </ul>

      <form
        ref={formRef}
        action={(formData) =>
          run(() => createQuickPoll(formData), () => formRef.current?.reset())
        }
        className="panel flex flex-col gap-3 p-4"
      >
        <h3 className="font-heading text-sm text-gold-light">{t.createTitle}</h3>
        <textarea
          name="question"
          required
          minLength={3}
          maxLength={300}
          rows={2}
          placeholder={t.questionPlaceholder}
          className={inputClass}
        />
        <div>
          <textarea
            name="options"
            required
            rows={4}
            placeholder={t.optionsPlaceholder}
            className={`${inputClass} w-full`}
          />
          <p className="mt-1 text-xs text-slate-500">{t.optionsHint}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-parchment">
          <input type="checkbox" name="active" defaultChecked className="accent-gold" />
          {t.activateNow}
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? t.creating : t.create}
        </button>
      </form>
    </div>
  );
}
