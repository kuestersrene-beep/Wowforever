import { setNewsRelease } from "./actions";

export interface NewsRow {
  id: number;
  kind: "item" | "blue" | "fc" | "ki";
  title: string;
  url: string | null;
  body: string | null;
  items: { id: number; name: string; price?: number | null; qty?: number | null }[];
  tags: string[];
  score: number;
  created_at: string;
  sent_at: string | null;
  show_page: boolean;
  post_discord: boolean;
  reviewed: boolean;
}

const KIND: Record<NewsRow["kind"], string> = {
  item: "Neu im AH",
  blue: "Bluepost",
  fc: "Patchnotes",
  ki: "KI-Wochenbericht",
};
const GOLD_TAGS = ["Droprate", "Rezept", "Händler", "Auktionshaus", "Gunst/Kisten", "Event", "Gold"];

const money = (c?: number | null) => {
  if (c == null) return "";
  const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100;
  return [g ? `${g}g` : "", s ? `${s}s` : "", k || (!g && !s) ? `${k}c` : ""].filter(Boolean).join(" ");
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

function Button({ id, action, label, tone }: { id: number; action: string; label: string; tone?: "gold" | "red" }) {
  const cls =
    tone === "red"
      ? "border-horde/60 text-horde hover:bg-horde/10"
      : tone === "gold"
        ? "border-gold/60 text-gold-light hover:bg-gold/10"
        : "border-gold/30 hover:bg-gold/10";
  return (
    <form action={setNewsRelease}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className={`rounded border px-2 py-0.5 text-xs ${cls}`}>{label}</button>
    </form>
  );
}

function NewsCard({ n }: { n: NewsRow }) {
  const gold = n.kind === "item" || n.kind === "ki" || n.items.length > 0 || n.tags.some((t) => GOLD_TAGS.includes(t));
  return (
    <div className={`rounded border px-3 py-2 text-sm ${n.reviewed ? "border-gold/10" : "border-gold/30"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded bg-gold/10 px-1.5 py-0.5 font-semibold text-gold-light">{KIND[n.kind] ?? n.kind}</span>
        <span>{fmt(n.created_at)}</span>
        <span className={gold ? "text-green-300" : "text-slate-500"}>{gold ? "mit Gold-Bezug" : "ohne Gold-Bezug"}</span>
        {n.show_page && <span className="text-green-300">auf der Seite</span>}
        {n.sent_at ? (
          <span className="text-green-300">in Discord gepostet {fmt(n.sent_at)}</span>
        ) : (
          n.post_discord && <span className="text-gold-light">für Discord freigegeben, wird gepostet</span>
        )}
        <span className="ml-auto flex flex-wrap gap-1">
          {n.show_page ? (
            <Button id={n.id} action="page_off" label="von der Seite nehmen" />
          ) : (
            <Button id={n.id} action="page_on" label="auf die Seite" tone="gold" />
          )}
          {!n.post_discord && !n.sent_at && <Button id={n.id} action="discord" label="in Discord posten" tone="gold" />}
          {n.reviewed ? (
            <Button id={n.id} action="reopen" label="zurück in die Liste" />
          ) : (
            <Button id={n.id} action="dismiss" label="verwerfen" tone="red" />
          )}
        </span>
      </div>
      <p className="mt-1 text-slate-200">
        {n.url ? (
          <a href={n.url} target="_blank" rel="noopener" className="hover:underline">
            {n.title}
          </a>
        ) : (
          n.title
        )}
      </p>
      {n.items.length > 0 && (
        <div className="mt-1 text-xs text-slate-400">
          Betrifft:{" "}
          {n.items
            .slice(0, 14)
            .map((x) => `${x.name}${x.price != null ? ` (${money(x.price)})` : ""}`)
            .join(", ")}
        </div>
      )}
      {n.tags.length > 0 && <div className="mt-1 text-xs text-slate-500">Stichworte: {n.tags.join(", ")}</div>}
      {n.body && (
        <details className="mt-1 text-xs text-slate-400">
          <summary className="cursor-pointer">Text</summary>
          <p className="mt-1 whitespace-pre-wrap">{n.body.slice(0, 2000)}</p>
        </details>
      )}
    </div>
  );
}

// Freigabe der Neuigkeiten: nichts geht ohne Klick auf die Tool-Seite oder nach Discord.
export default function NewsReview({ open, done }: { open: NewsRow[]; done: NewsRow[] }) {
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-heading text-lg text-gold-light">Neuigkeiten freigeben ({open.length} offen)</h2>
      <p className="text-xs text-slate-500">
        Der Dienst sammelt neue Items im AH, Blueposts, foreverchanges-Patchnotes und den KI-Wochenbericht. Nichts
        erscheint von selbst: <b>auf die Seite</b> zeigt eine Meldung im Goldkalender des Tools, <b>in Discord
        posten</b> lässt sie Marin einmal in den Gold-News-Kanal posten (innerhalb einer Minute;{" "}
        <code>GOLD_NEWS_KANAL_ID</code> in der Bot-<code>.env</code>, sonst 💰│gold-news). Beides ist unabhängig
        voneinander. Sortiert nach Gold-Bezug.
      </p>
      <div className="flex flex-col gap-2">
        {open.map((n) => (
          <NewsCard key={n.id} n={n} />
        ))}
        {open.length === 0 && <p className="text-slate-500">Nichts offen.</p>}
      </div>
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-slate-400">Zuletzt bearbeitet ({done.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {done.map((n) => (
              <NewsCard key={n.id} n={n} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
