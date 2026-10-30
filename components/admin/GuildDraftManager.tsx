"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  activateGuildDraft,
  createGuildDraft,
  deleteGuildDraft,
  updateGuildDraft,
} from "@/app/fraktionen/actions";
import type { Dictionary } from "@/lib/i18n/types";
import type { GuildDraft } from "@/lib/types";
import GuildDraftForm from "./GuildDraftForm";

export default function GuildDraftManager({
  drafts,
  dict,
}: {
  drafts: GuildDraft[];
  dict: Dictionary;
}) {
  const t = dict.guildDrafts.admin;
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = (fn: () => Promise<void>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onSuccess?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t.save);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-sm text-gold-light">{t.listTitle}</h3>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="flex flex-col gap-3">
        {drafts.map((d) =>
          editingId === d.id ? (
            <GuildDraftForm
              key={d.id}
              draft={d}
              dict={dict}
              isPending={isPending}
              onCancel={() => setEditingId(null)}
              onSubmit={(formData) =>
                run(() => updateGuildDraft(d.id, formData), () => setEditingId(null))
              }
            />
          ) : (
            <li key={d.id} className="panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1">
                  <p className="font-medium text-parchment">
                    {d.name}{" "}
                    <span className="text-xs text-slate-500">/{d.slug}</span>
                  </p>
                  {d.tagline && <p className="text-sm text-slate-400">{d.tagline}</p>}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    d.active
                      ? "bg-emerald-950 text-emerald-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {d.active ? dict.guildDrafts.active : "–"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {!d.active && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => activateGuildDraft(d.id))}
                    className="rounded-lg border border-gold/50 px-3 py-1.5 text-sm text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    {isPending ? t.activating : t.activate}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(d.id)}
                  className="rounded-lg border border-gold/30 px-3 py-1.5 text-sm text-parchment transition hover:bg-gold/10"
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm(t.deleteConfirm)) return;
                    run(() => deleteGuildDraft(d.id));
                  }}
                  className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {t.delete}
                </button>
              </div>
            </li>
          )
        )}
        {drafts.length === 0 && (
          <li className="panel p-4 text-center text-sm text-slate-500">
            {dict.guildDrafts.empty}
          </li>
        )}
      </ul>

      {adding ? (
        <GuildDraftForm
          dict={dict}
          isPending={isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(formData) =>
            run(() => createGuildDraft(formData), () => setAdding(false))
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start rounded-lg border border-gold/50 px-4 py-2 text-sm text-gold-light transition hover:bg-gold/10"
        >
          + {t.addTitle}
        </button>
      )}
    </div>
  );
}
