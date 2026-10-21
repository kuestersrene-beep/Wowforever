"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/termine/actions";
import { INSTANCES, MAX_REPEAT_WEEKS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const inputClass =
  "rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none";

export default function EventCreateForm() {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    // datetime-local liefert die Uhrzeit ohne Zeitzone. Im Browser in
    // ISO-Strings umrechnen, damit die lokale Zeit der Admin-Person gilt
    // und nicht die Zeitzone des Servers. Wiederholungen werden hier per
    // setDate(+7) berechnet statt serverseitig mit +7x24h, damit sie über
    // die Zeitumstellung hinweg dieselbe Uhrzeit behalten.
    const local = String(formData.get("starts_at_local") ?? "");
    const weeks = Math.min(
      MAX_REPEAT_WEEKS,
      Math.max(1, Number(formData.get("repeat_weeks")) || 1)
    );
    formData.delete("starts_at");
    for (let i = 0; i < weeks; i++) {
      const date = new Date(local);
      date.setDate(date.getDate() + i * 7);
      formData.append("starts_at", date.toISOString());
    }
    startTransition(async () => {
      await createEvent(formData);
      formRef.current?.reset();
      router.refresh();
    });
  };

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="panel flex flex-col gap-3 border-horde/40 p-4"
    >
      <h2 className="font-heading text-sm text-horde">
        {dict.events.admin.createTitle}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {dict.events.admin.titleLabel}
          <input
            type="text"
            name="title"
            required
            maxLength={120}
            placeholder={dict.events.admin.titlePlaceholder}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {dict.events.admin.instanceLabel}
          <input
            type="text"
            name="instance"
            list="instance-suggestions"
            maxLength={120}
            className={inputClass}
          />
          <datalist id="instance-suggestions">
            {INSTANCES.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {dict.events.admin.startsAtLabel}
          <input
            type="datetime-local"
            name="starts_at_local"
            required
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            {dict.events.admin.maxSizeLabel}
            <input
              type="number"
              name="max_size"
              min={1}
              max={40}
              defaultValue={40}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            {dict.events.admin.repeatLabel}
            <input
              type="number"
              name="repeat_weeks"
              min={1}
              max={MAX_REPEAT_WEEKS}
              defaultValue={1}
              className={inputClass}
            />
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-500">{dict.events.admin.repeatHint}</p>
      <textarea
        name="description"
        rows={2}
        maxLength={1000}
        placeholder={dict.events.admin.descriptionLabel}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? dict.events.admin.creating : dict.events.admin.create}
      </button>
    </form>
  );
}
