"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Upload der Tool-Vorlage (dashboard-teilen.html) über die Route ./upload.
// Jede Antwort wird als Meldung angezeigt, auch die eines vorgeschalteten
// Proxys (z. B. nginx mit zu kleinem client_max_body_size: Status 413).
export default function DashboardUpload({ defaultRuleset }: { defaultRuleset: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (file instanceof File && file.size > 9 * 1024 * 1024) {
      setMsg({ ok: false, text: "Datei ist zu groß (max. 9 MB)." });
      return;
    }
    setBusy(true);
    setMsg({ ok: true, text: "Wird hochgeladen …" });
    try {
      const res = await fetch("/admin/gold-radar/upload", { method: "POST", body: data });
      const json = await res.json().catch(() => null);
      if (json && typeof json.message === "string") {
        setMsg({ ok: !!json.ok, text: json.message });
      } else if (res.status === 413) {
        setMsg({
          ok: false,
          text: "Der Server lehnt die Datei als zu groß ab (Status 413). In der nginx-Konfiguration client_max_body_size 50m setzen und nginx neu laden.",
        });
      } else {
        setMsg({ ok: false, text: `Hochladen fehlgeschlagen (Status ${res.status}). Details: docker compose logs app` });
      }
      if (res.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Keine Verbindung zum Server. Bitte erneut versuchen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          name="ruleset"
          defaultValue={defaultRuleset}
          pattern="[a-z0-9-]{1,40}"
          className="w-40 rounded border border-gold/30 bg-ink px-2 py-1"
        />
        <input name="file" type="file" accept=".html,text/html" required className="text-slate-300" />
        <button
          disabled={busy}
          className="rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-1 font-medium text-ink hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Lädt …" : "Hochladen"}
        </button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
