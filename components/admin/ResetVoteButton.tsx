"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminResetGuildDraftVote } from "@/app/fraktionen/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

// Admin-only: setzt die (sonst gebundene, von der Person selbst nicht
// änderbare) Stimme einer einzelnen Person zurück - für nachträgliche
// Korrekturen in der Übersicht unter /admin/fraktionen.
export default function ResetVoteButton({ userId }: { userId: string }) {
  const { dict } = useI18n();
  const t = dict.guildDrafts.admin;
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await adminResetGuildDraftVote(userId);
          router.refresh();
        })
      }
      className="text-xs text-slate-500 underline-offset-2 transition hover:text-red-400 hover:underline disabled:opacity-50"
    >
      {isPending ? t.resettingVote : t.resetVote}
    </button>
  );
}
