"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { removeGuildDraftVote, voteGuildDraft } from "@/app/fraktionen/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

// Die eigentliche Stimmabgabe: jede angemeldete Person kann auf
// "Aufheben" klicken, das zählt als ihre (private) Stimme für diese
// Fraktion - siehe RLS in supabase/schema.sql, sichtbar ist das nur im
// Admin-Dashboard. Gleiche Optik wie das echte WoW-"Aufheben bindet
// diesen Gegenstand"-Popup, verhindert vor allem einen versehentlichen
// Tap auf Mobile. Getrennt von DecideFactionButton (admin-only), der
// die tatsächliche, öffentliche Endauswahl trifft.
export default function VoteButton({ draftId, voted }: { draftId: string; voted: boolean }) {
  const { dict } = useI18n();
  const t = dict.guildDrafts;
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  if (voted) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => removeGuildDraftVote())}
        className="rounded-lg border border-emerald-600 bg-emerald-950 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-900 disabled:opacity-50"
      >
        {t.voted}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-gold/60 px-4 py-2 text-sm font-medium text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
      >
        {isPending ? t.activating : t.activate}
      </button>

      {confirming &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setConfirming(false)}
          >
            <div
              className="w-[min(90vw,340px)] rounded border-2 border-[#c8aa6e] bg-black p-5 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm leading-relaxed text-white">{t.equipConfirmText}</p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    run(() => voteGuildDraft(draftId));
                  }}
                  className="rounded border border-gold/60 bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold-light transition hover:bg-gold/20"
                >
                  {t.activate}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded border border-slate-600 px-4 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  {t.equipConfirmCancel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
