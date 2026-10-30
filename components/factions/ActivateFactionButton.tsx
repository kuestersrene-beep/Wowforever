"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateGuildDraft } from "@/app/fraktionen/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function ActivateFactionButton({ id }: { id: string }) {
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await activateGuildDraft(id);
          router.refresh();
        })
      }
      className="rounded-lg border border-gold/60 px-4 py-2 text-sm font-medium text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
    >
      {isPending ? dict.guildDrafts.activating : dict.guildDrafts.activate}
    </button>
  );
}
