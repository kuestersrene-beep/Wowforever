"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/LocaleProvider";

// Fängt Fehler aus allen Seiten ab (z. B. eine fehlgeschlagene Server
// Action beim Speichern), statt Next.js' weißer "Application error"-Seite.
// Nach einem Neubau der Website kennt der Server die Server Actions und
// Skripte einer schon offenen Seite nicht mehr - dann einmal automatisch
// neu laden, das behebt es.
const STALE_DEPLOY = /Failed to find Server Action|ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i;
const RELOAD_KEY = "error-auto-reload";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const { dict } = useI18n();
  const t = dict.errorPage;

  useEffect(() => {
    console.error(error);
    if (!STALE_DEPLOY.test(error.message)) return;
    try {
      // Höchstens einmal pro Minute, damit ein echter Fehler keine Schleife auslöst
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <main className="panel mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-6 text-center">
      <h1 className="heading-ornate text-2xl">{t.title}</h1>
      <p className="text-sm leading-relaxed text-parchment/90">{t.text}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
        >
          {t.reload}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gold/30 px-4 py-2 font-medium text-parchment transition hover:bg-gold/10"
        >
          {t.home}
        </Link>
      </div>
      {error.digest && <p className="text-xs text-slate-500">Fehler-Code: {error.digest}</p>}
    </main>
  );
}
