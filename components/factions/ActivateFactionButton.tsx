"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { activateGuildDraft } from "@/app/fraktionen/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

// Button + Bestätigungsdialog im Stil des echten WoW-"Aufheben bindet
// diesen Gegenstand"-Popups (StaticPopup "LOOT_BIND" - der Wappenrock
// ist laut Tooltip "Beim Aufheben gebunden", nicht erst beim Anlegen:
// schlichtes, zentriertes Panel mit Text + zwei Buttons, kein Titel).
// Nachgebaute Optik, kein Blizzard-Asset - verhindert vor allem, dass
// auf Mobile ein versehentlicher Tap gleich aktiviert.
export default function ActivateFactionButton({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.guildDrafts;
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
                  onClick={confirm}
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
