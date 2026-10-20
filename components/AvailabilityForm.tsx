"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAvailability, clearAvailability } from "@/app/verfuegbarkeit/actions";
import { DAYPARTS, WEEKDAYS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function AvailabilityForm({
  existingSlots,
}: {
  existingSlots: string[];
}) {
  const { dict } = useI18n();
  const [selected, setSelected] = useState(new Set(existingSlots));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (slot: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) {
        next.delete(slot);
      } else {
        next.add(slot);
      }
      return next;
    });
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await saveAvailability(formData);
      router.refresh();
    });
  };

  const handleClear = () => {
    if (!confirm(dict.availability.clearConfirm)) return;
    startTransition(async () => {
      await clearAvailability();
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1" />
              {WEEKDAYS.map((day) => (
                <th
                  key={day}
                  className="px-2 py-1 font-medium text-gold-light"
                >
                  {dict.labels.weekday[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYPARTS.map((part) => (
              <tr key={part}>
                <th className="px-2 py-1 text-right text-xs font-normal text-slate-400">
                  {dict.labels.daypart[part]}
                </th>
                {WEEKDAYS.map((day) => {
                  const slot = `${day}_${part}`;
                  const checked = selected.has(slot);
                  return (
                    <td key={slot} className="px-1 py-1">
                      <label className="block cursor-pointer">
                        <input
                          type="checkbox"
                          name="slot"
                          value={slot}
                          checked={checked}
                          onChange={() => toggle(slot)}
                          className="sr-only"
                        />
                        <span
                          className={`block h-8 w-full rounded-lg border transition ${
                            checked
                              ? "border-gold bg-gold/30"
                              : "border-gold/20 bg-panel hover:bg-gold/10"
                          }`}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.size === 0 && (
        <p className="text-xs text-slate-400">{dict.availability.noSlotsHint}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.availability.saving : dict.availability.save}
        </button>
        {existingSlots.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline"
          >
            {dict.availability.clearButton}
          </button>
        )}
      </div>
    </form>
  );
}
