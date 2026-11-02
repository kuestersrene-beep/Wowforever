"use client";

// Fehler auf der Admin-Seite (z. B. eine fehlgeschlagene Aktion) als lesbare
// Meldung statt „Application error: a client-side exception“.
export default function GoldRadarAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="panel flex flex-col gap-3 p-5">
      <h1 className="heading-ornate text-xl">Blackwater Terminal: Fehler</h1>
      <p className="text-slate-300">Die letzte Aktion hat nicht geklappt.</p>
      <p className="text-sm text-slate-400">
        {error.message || "Ohne Details."}
        {error.digest ? ` (Kennung ${error.digest}: Details in docker compose logs app)` : ""}
      </p>
      <button onClick={reset} className="w-fit rounded border border-gold/40 px-3 py-1 text-sm hover:bg-gold/10">
        Erneut versuchen
      </button>
    </main>
  );
}
