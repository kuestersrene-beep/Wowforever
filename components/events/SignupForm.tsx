"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSignup, saveSignup } from "@/app/termine/actions";
import { SIGNUP_STATUSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Character, EventSignupRow, SignupStatus } from "@/lib/types";

const STATUS_STYLES: Record<SignupStatus, string> = {
  dabei: "has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-600/30",
  vorlaeufig: "has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/20",
  abgemeldet: "has-[:checked]:border-red-500 has-[:checked]:bg-red-600/20",
};

export default function SignupForm({
  eventId,
  characters,
  existing,
}: {
  eventId: string;
  characters: Character[];
  existing: EventSignupRow | null;
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    setSaved(false);
    startTransition(async () => {
      await saveSignup(formData);
      setSaved(true);
      router.refresh();
    });
  };

  const handleRemove = () => {
    if (!confirm(dict.events.signupRemoveConfirm)) return;
    startTransition(async () => {
      await removeSignup(eventId);
      setSaved(false);
      router.refresh();
    });
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="event_id" value={eventId} />
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {dict.events.characterLabel}
        <select
          name="character_id"
          required
          defaultValue={existing?.character_id ?? characters[0]?.id}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none sm:max-w-xs"
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} – {dict.labels.class[c.class] ?? c.class} ({dict.labels.role[c.role]})
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs text-slate-400">{dict.events.statusLabel}</legend>
        {SIGNUP_STATUSES.map((status) => (
          <label
            key={status}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border border-gold/20 px-3 py-1.5 text-sm text-parchment ${STATUS_STYLES[status]}`}
          >
            <input
              type="radio"
              name="status"
              value={status}
              required
              defaultChecked={(existing?.status ?? "dabei") === status}
              className="sr-only"
            />
            {dict.labels.signupStatus[status]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {dict.events.commentLabel}
        <input
          type="text"
          name="comment"
          maxLength={200}
          defaultValue={existing?.comment ?? ""}
          placeholder={dict.events.commentPlaceholder}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.events.signupSaving : dict.events.signupSave}
        </button>
        {saved && !isPending && (
          <span className="text-sm text-emerald-400">{dict.survey.saved}</span>
        )}
        {existing && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {dict.events.signupRemove}
          </button>
        )}
      </div>
    </form>
  );
}
