"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/i18n/actions";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/types";

export default function LanguageSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchTo = (target: Locale) => {
    if (target === locale) return;
    startTransition(async () => {
      await setLocale(target);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-1 text-xs">
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          disabled={isPending}
          className={`rounded px-2 py-1 font-medium uppercase transition disabled:opacity-50 ${
            locale === l
              ? "bg-gold/20 text-gold-light"
              : "text-slate-400 hover:bg-gold/10"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
