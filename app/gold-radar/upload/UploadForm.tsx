"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadScan, type UploadResult } from "./actions";

// Pfad zum Kopieren: Der Browser darf keinen Ordner vorgeben, im
// Datei-Dialog lässt er sich aber oben in die Adresszeile einfügen.
export default function UploadForm({ rulesets, wowPath }: { rulesets: string[]; wowPath: string }) {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(wowPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          const res = await uploadScan(null, data);
          setResult(res);
          if (res.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm text-slate-300">1. Diesen Pfad kopieren</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-black/40 px-2 py-1 text-xs text-gold-light">{wowPath}</code>
          <button type="button" onClick={copyPath} className="rounded border border-gold/40 px-2 py-0.5 text-xs text-gold-light hover:bg-gold/10">
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
        <span className="text-xs text-slate-500">
          Im Datei-Dialog oben in die Adresszeile einfügen, Enter drücken, dann den Ordner mit deinem
          Accountnamen öffnen und darin <b>SavedVariables</b>. Liegt dein Spiel woanders, passe den Anfang an.
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-300">2. Datei wählen (AuctionDB.lua, Auctionator.lua oder Blackthornes_TS.lua)</span>
        <input type="file" name="file" accept=".lua" required className="text-sm text-slate-300" />
      </label>

      {rulesets.length > 1 ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">Auktionshaus</span>
          <select name="ruleset" className="w-fit rounded border border-gold/30 bg-ink px-2 py-1 text-sm" defaultValue={rulesets[0]}>
            {rulesets.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="ruleset" value={rulesets[0]} />
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="w-fit rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-1.5 font-medium text-ink hover:brightness-110 disabled:opacity-60">
          {pending ? "Lädt hoch …" : "3. Hochladen"}
        </button>
        {result && <span className={result.ok ? "text-sm text-green-400" : "text-sm text-red-400"}>{result.message}</span>}
      </div>
    </form>
  );
}
