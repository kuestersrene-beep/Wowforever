"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { activateGuildDraft } from "@/app/fraktionen/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

// Admin-only: legt diese Fraktion endgültig als Ergebnis fest
// (öffentlich sichtbar, triggert die Discord-Ankündigung). Getrennt von
// VoteButton, über das jede angemeldete Person ihre private Stimme
// abgibt - diese Stimmen entscheiden nichts automatisch, ein:e Admin
// trifft die tatsächliche Wahl bewusst hier.
export default function ActivateFactionButton({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.guildDrafts.admin;
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    setConfirming(false);
    startTransition(async () => {
      await activateGuildDraft(id);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-gold/60 px-4 py-2 text-sm font-medium text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
      >
        {isPending ? t.deciding : t.decide}
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
              <p className="text-sm leading-relaxed text-white">{t.decideConfirmText}</p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={confirm}
                  className="rounded border border-gold/60 bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold-light transition hover:bg-gold/20"
                >
                  {t.decide}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded border border-slate-600 px-4 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  {dict.guildDrafts.equipConfirmCancel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
