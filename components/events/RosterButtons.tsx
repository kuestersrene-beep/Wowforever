"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRosterSlot } from "@/app/termine/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { RosterSlot } from "@/lib/types";

// Admin-Knöpfe pro Anmeldung: bestätigen, auf die Bank setzen oder
// wieder in "noch nicht eingeteilt" zurücksetzen.
export default function RosterButtons({
  eventId,
  userId,
  discordId,
  slot,
}: {
  eventId: string;
  // null bei Anmeldungen nur über Discord - dann zählt die Discord-ID.
  userId: string | null;
  discordId: string;
  slot: RosterSlot | null;
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const set = (next: RosterSlot | null) => {
    startTransition(async () => {
      await setRosterSlot(eventId, { userId, discordId }, next);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded border px-2 py-0.5 text-xs transition disabled:opacity-50";

  return (
    <div className="flex gap-1.5">
      {slot !== "bestaetigt" && (
        <button
          type="button"
          onClick={() => set("bestaetigt")}
          disabled={isPending}
          className={`${buttonClass} border-emerald-600/60 text-emerald-400 hover:bg-emerald-600/20`}
        >
          {dict.events.admin.confirm}
        </button>
      )}
      {slot !== "bank" && (
        <button
          type="button"
          onClick={() => set("bank")}
          disabled={isPending}
          className={`${buttonClass} border-amber-500/60 text-amber-400 hover:bg-amber-500/20`}
        >
          {dict.events.admin.bench}
        </button>
      )}
      {slot && (
        <button
          type="button"
          onClick={() => set(null)}
          disabled={isPending}
          className={`${buttonClass} border-slate-600 text-slate-400 hover:bg-slate-700/40`}
        >
          {dict.events.admin.reset}
        </button>
      )}
    </div>
  );
}
