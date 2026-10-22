"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContent, setSectionVisible } from "@/app/admin/texte/actions";
import { plainTextToHtml, type ContentField } from "@/lib/contentFields";
import RichEditor from "@/components/admin/RichEditor";

type Lang = "de" | "en";

export type EditorField = ContentField & {
  // Eingebauter Text je Sprache (lib/i18n/*.ts).
  defaults: Record<Lang, string>;
  // Gespeicherte Änderung je Sprache, null = eingebauter Text.
  values: Record<Lang, string | null>;
};

interface EditorGroup {
  id: string;
  title: string;
  toggles: { key: string; label: string; visible: boolean }[];
  fields: EditorField[];
}

const draftKey = (lang: Lang, key: string) => `${lang}:${key}`;

const isHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

// Eingebauter Text als Editor-HTML (eingebaute Texte sind Klartext).
const defaultHtml = (f: EditorField, lang: Lang) =>
  isHtml(f.defaults[lang]) ? f.defaults[lang] : plainTextToHtml(f.defaults[lang]);

export default function ContentEditor({ groups }: { groups: EditorGroup[] }) {
  const [lang, setLang] = useState<Lang>("de");

  // Gespeicherter Stand und Entwurf je "sprache:schlüssel". null = Standard.
  const initial = Object.fromEntries(
    groups.flatMap((g) =>
      g.fields.flatMap((f) => [
        [draftKey("de", f.key), f.values.de],
        [draftKey("en", f.key), f.values.en],
      ])
    )
  ) as Record<string, string | null>;
  const [saved, setSaved] = useState(initial);
  const [drafts, setDrafts] = useState(initial);
  // Erhöht sich beim Zurücksetzen, damit der Rich-Editor neu startet.
  const [resetCounter, setResetCounter] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Sprache:</span>
        {(["de", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`rounded-md px-3 py-1 font-medium transition ${
              lang === l ? "bg-gold/30 text-gold-light" : "text-slate-400 hover:bg-gold/10"
            }`}
          >
            {l === "de" ? "Deutsch" : "English"}
          </button>
        ))}
      </div>

      {groups.map((group, i) => (
        <GroupEditor
          key={`${group.id}-${lang}`}
          group={group}
          lang={lang}
          defaultOpen={i === 0}
          drafts={drafts}
          saved={saved}
          resetCounter={resetCounter}
          onDraft={(key, value) => setDrafts((d) => ({ ...d, [draftKey(lang, key)]: value }))}
          onReset={(key) => {
            setDrafts((d) => ({ ...d, [draftKey(lang, key)]: null }));
            setResetCounter((c) => c + 1);
          }}
          onSaved={(entries) =>
            setSaved((s) => {
              const next = { ...s };
              for (const e of entries) next[draftKey(lang, e.key)] = e.value;
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

function GroupEditor({
  group,
  lang,
  defaultOpen,
  drafts,
  saved,
  resetCounter,
  onDraft,
  onReset,
  onSaved,
}: {
  group: EditorGroup;
  lang: Lang;
  defaultOpen: boolean;
  drafts: Record<string, string | null>;
  saved: Record<string, string | null>;
  resetCounter: number;
  onDraft: (key: string, value: string | null) => void;
  onReset: (key: string) => void;
  onSaved: (entries: { key: string; value: string | null }[]) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const router = useRouter();

  // Entwurf normalisieren: leer bzw. identisch mit dem Standardtext gilt
  // als "kein eigener Text".
  const normalized = (f: EditorField): string | null => {
    const value = drafts[draftKey(lang, f.key)];
    if (value === null || value === undefined) return null;
    if (f.kind === "rich") {
      if (!value.replace(/<[^>]*>/g, "").trim()) return null;
      if (value === defaultHtml(f, lang)) return null;
      return value;
    }
    const trimmed = value.trim();
    return trimmed && trimmed !== f.defaults[lang] ? trimmed : null;
  };

  const changed = group.fields.filter(
    (f) => normalized(f) !== (saved[draftKey(lang, f.key)] ?? null)
  );

  const handleSave = () => {
    const entries = changed.map((f) => ({ key: f.key, value: normalized(f) }));
    setStatus(null);
    startTransition(async () => {
      try {
        await saveContent(lang, entries);
        onSaved(entries);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  };

  const handleToggle = (key: string, visible: boolean) => {
    startTransition(async () => {
      try {
        await setSectionVisible(key, visible);
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  };

  return (
    <details open={defaultOpen} className="panel group p-4">
      <summary className="cursor-pointer list-none font-heading text-lg text-gold-light">
        <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
        {group.title}
        {changed.length > 0 && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 align-middle font-sans text-xs text-amber-300">
            {changed.length} ungespeichert
          </span>
        )}
      </summary>

      <div className="mt-4 flex flex-col gap-5">
        {group.toggles.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-gold/20 bg-ink/30 p-3">
            {group.toggles.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm text-parchment">
                <input
                  type="checkbox"
                  defaultChecked={t.visible}
                  disabled={isPending}
                  onChange={(e) => handleToggle(t.key, e.target.checked)}
                  className="h-4 w-4 accent-gold"
                />
                {t.label}
              </label>
            ))}
          </div>
        )}

        {group.fields.map((f) => {
          const current = drafts[draftKey(lang, f.key)];
          const isCustom = normalized(f) !== null;
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-300">{f.label}</span>
                <span
                  className={`rounded border px-1.5 ${
                    isCustom
                      ? "border-gold/50 text-gold-light"
                      : "border-slate-700 text-slate-500"
                  }`}
                >
                  {isCustom ? "eigener Text" : "Standard"}
                </span>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => onReset(f.key)}
                    className="ml-auto text-slate-400 underline-offset-2 hover:underline"
                  >
                    Auf Standard zurücksetzen
                  </button>
                )}
              </div>
              {f.kind === "rich" ? (
                <RichEditor
                  key={`${lang}-${f.key}-${resetCounter}`}
                  initialHtml={current ?? defaultHtml(f, lang)}
                  onChange={(html) => onDraft(f.key, html)}
                />
              ) : (
                <input
                  type="text"
                  // Mit dem aktuellen Text vorausgefüllt, damit kleine
                  // Änderungen ohne Neutippen gehen. Leer = Standard.
                  value={current ?? f.defaults[lang]}
                  placeholder={f.defaults[lang]}
                  maxLength={500}
                  onChange={(e) => onDraft(f.key, e.target.value)}
                  className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-sm text-parchment placeholder:text-slate-500 focus:border-gold focus:outline-none"
                />
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || changed.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Speichert..." : `${group.title} speichern`}
          </button>
          {status === "saved" && !isPending && changed.length === 0 && (
            <span className="text-sm text-emerald-400">Gespeichert ✓ – ist sofort live</span>
          )}
          {status === "error" && (
            <span className="text-sm text-red-400">
              Speichern fehlgeschlagen – ist supabase/schema.sql auf dem neuesten Stand
              eingespielt?
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
