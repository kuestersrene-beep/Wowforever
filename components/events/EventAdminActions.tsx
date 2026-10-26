"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent, postRosterToDiscord } from "@/app/termine/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function EventAdminActions({
  eventId,
  isSeries,
}: {
  eventId: string;
  isSeries: boolean;
}) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [posted, setPosted] = useState<boolean | null>(null);
  const router = useRouter();

  const handlePost = () => {
    setPosted(null);
    startTransition(async () => {
      setPosted(await postRosterToDiscord(eventId));
    });
  };

  const handleDelete = (wholeSeries: boolean) => {
    const question = wholeSeries
      ? dict.events.admin.deleteSeriesConfirm
      : dict.events.admin.deleteEventConfirm;
    if (!confirm(question)) return;
    startTransition(async () => {
      await deleteEvent(eventId, wholeSeries);
      router.push("/termine");
      router.refresh();
    });
  };

  return (
    <section className="panel flex flex-wrap items-center gap-3 border-horde/40 p-4">
      <button
        type="button"
        onClick={handlePost}
        disabled={isPending}
        className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752C4] disabled:opacity-50"
      >
        {isPending ? dict.events.admin.postingRoster : dict.events.admin.postRoster}
      </button>
      {posted === true && (
        <span className="text-sm text-emerald-400">{dict.events.admin.rosterPosted}</span>
      )}
      {posted === false && (
        <span className="text-sm text-red-400">{dict.events.admin.rosterPostFailed}</span>
      )}
      <div className="ml-auto flex gap-3">
        <button
          type="button"
          onClick={() => handleDelete(false)}
          disabled={isPending}
          className="text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {dict.events.admin.deleteEvent}
        </button>
        {isSeries && (
          <button
            type="button"
            onClick={() => handleDelete(true)}
            disabled={isPending}
            className="text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {dict.events.admin.deleteSeries}
          </button>
        )}
      </div>
    </section>
  );
}
