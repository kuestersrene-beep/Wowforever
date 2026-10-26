"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suggestGuildName, withdrawGuildName } from "@/app/gildenname/actions";
import { GUILD_NAME_MAX_LENGTH, MAX_GUILD_NAME_SUGGESTIONS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { formatSuggestionLimit } from "@/lib/i18n/format";
import type { GuildNameStatus, GuildNameSuggestion } from "@/lib/types";

const STATUS_STYLES: Record<GuildNameStatus, string> = {
  offen: "border-amber-500/50 text-amber-400",
  freigegeben: "border-emerald-600/60 text-emerald-400",
  abgelehnt: "border-red-500/50 text-red-400",
};

export default function SuggestGuildNameForm({
  mine,
}: {
  mine: GuildNameSuggestion[];
}) {
  const { dict } = useI18n();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  // Ändern sich die eigenen Vorschläge (z. B. freigegeben, abgelehnt,
  // zurückgezogen), ist eine alte Fehlermeldung wie "Limit erreicht"
  // nicht mehr aktuell. Eine Erfolgsmeldung bleibt stehen.
  const mineKey = mine.map((s) => `${s.id}:${s.status}`).join(",");
  useEffect(() => {
    setMessage((m) => (m?.ok ? m : null));
  }, [mineKey]);

  const handleSubmit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await suggestGuildName(formData);
      if (result.ok) {
        formRef.current?.reset();
        setMessage({ ok: true, text: dict.guildName.suggested });
        router.refresh();
        return;
      }
      setMessage({
        ok: false,
        text:
          result.reason === "duplicate"
            ? dict.guildName.errorDuplicate
            : result.reason === "limit"
              ? formatSuggestionLimit(dict, MAX_GUILD_NAME_SUGGESTIONS)
              : dict.guildName.errorInvalid,
      });
    });
  };

  const handleWithdraw = (id: string) => {
    if (!confirm(dict.guildName.withdrawConfirm)) return;
    startTransition(async () => {
      await withdrawGuildName(id);
      setMessage(null);
      router.refresh();
    });
  };

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <h2 className="font-heading text-base text-gold-light">{dict.guildName.suggestTitle}</h2>
      <p className="text-xs text-slate-400">{dict.guildName.suggestHint}</p>
      <form ref={formRef} action={handleSubmit} className="flex flex-wrap gap-3">
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={GUILD_NAME_MAX_LENGTH}
          placeholder={dict.guildName.suggestPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.guildName.suggesting : dict.guildName.suggest}
        </button>
      </form>
      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-gold/20 pt-3">
          <h3 className="text-xs uppercase tracking-wide text-slate-400">
            {dict.guildName.mineTitle}
          </h3>
          <ul className="flex flex-col gap-2">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-parchment">{s.name}</span>
                <span className={`rounded border px-1.5 text-[11px] ${STATUS_STYLES[s.status]}`}>
                  {dict.guildName.status[s.status]}
                </span>
                {s.status === "offen" && (
                  <button
                    type="button"
                    onClick={() => handleWithdraw(s.id)}
                    disabled={isPending}
                    className="ml-auto text-xs text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {dict.guildName.withdraw}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
