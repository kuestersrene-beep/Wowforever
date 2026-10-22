"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGuildName, moderateGuildName } from "@/app/gildenname/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { GuildNameSuggestion } from "@/lib/types";

// Nur für Admins: offene Vorschläge freigeben oder ablehnen. Abgelehnte
// lassen sich nachträglich doch noch freigeben oder ganz löschen (dann
// kann der Name erneut vorgeschlagen werden).
export default function GuildNameAdminQueue({
  pending,
  rejected,
}: {
  pending: GuildNameSuggestion[];
  rejected: GuildNameSuggestion[];
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  const buttonClass = "rounded border px-2 py-0.5 text-xs transition disabled:opacity-50";

  return (
    <section className="panel flex flex-col gap-3 border-horde/40 p-4">
      <h2 className="font-heading text-base text-red-300">
        {dict.guildName.admin.queueTitle} ({pending.length})
      </h2>
      <p className="text-xs text-slate-400">{dict.guildName.admin.queueHint}</p>
      {pending.length === 0 ? (
        <p className="text-sm text-slate-500">{dict.guildName.admin.queueEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {pending.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="flex-1">
                <p className="font-medium text-parchment">{s.name}</p>
                <p className="text-xs text-slate-500">
                  {dict.guildName.suggestedBy} {s.display_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => run(() => moderateGuildName(s.id, "freigegeben"))}
                disabled={isPending}
                className={`${buttonClass} border-emerald-600/60 text-emerald-400 hover:bg-emerald-600/20`}
              >
                {dict.guildName.admin.approve}
              </button>
              <button
                type="button"
                onClick={() => run(() => moderateGuildName(s.id, "abgelehnt"))}
                disabled={isPending}
                className={`${buttonClass} border-red-500/50 text-red-400 hover:bg-red-600/20`}
              >
                {dict.guildName.admin.reject}
              </button>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-400">
            {dict.guildName.admin.rejectedTitle} ({rejected.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rejected.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <span className="flex-1 text-slate-400 line-through">{s.name}</span>
                <button
                  type="button"
                  onClick={() => run(() => moderateGuildName(s.id, "freigegeben"))}
                  disabled={isPending}
                  className={`${buttonClass} border-emerald-600/60 text-emerald-400 hover:bg-emerald-600/20`}
                >
                  {dict.guildName.admin.approve}
                </button>
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
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
