"use client";

import { useState } from "react";
import type { CoreFigure, GuildDraft } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import RichEditor from "@/components/admin/RichEditor";

const inputClass =
  "rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none";

// Formular für einen Gildenentwurf, sowohl zum Anlegen als auch zum
// Bearbeiten (dann mit "draft" vorbefüllt). Die Kernfiguren-Liste ist
// dynamisch (Zeilen hinzufügen/entfernen) und wird beim Absenden als
// JSON in ein verstecktes Feld geschrieben (siehe app/fraktionen/
// actions.ts -> parseCoreFigures).
export default function GuildDraftForm({
  draft,
  dict,
  isPending,
  onSubmit,
  onCancel,
}: {
  draft?: GuildDraft;
  dict: Dictionary;
  isPending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
}) {
  const t = dict.guildDrafts.admin;
  const [figures, setFigures] = useState<CoreFigure[]>(draft?.core_figures ?? []);

  const updateFigure = (i: number, patch: Partial<CoreFigure>) => {
    setFigures((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const removeFigure = (i: number) => {
    setFigures((prev) => prev.filter((_, idx) => idx !== i));
  };

  return (
    <form
      action={(formData) => {
        formData.set("core_figures", JSON.stringify(figures));
        onSubmit(formData);
      }}
      className="panel flex flex-col gap-3 p-4"
    >
      <h3 className="font-heading text-sm text-gold-light">
        {draft ? t.editTitle : t.addTitle}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <input
            type="text"
            name="slug"
            required
            defaultValue={draft?.slug ?? ""}
            placeholder={t.slugLabel}
            className={`${inputClass} w-full`}
          />
          <p className="mt-1 text-xs text-slate-500">{t.slugHint}</p>
        </div>
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          defaultValue={draft?.name ?? ""}
          placeholder={t.nameLabel}
          className={inputClass}
        />
        <input
          type="text"
          name="tagline"
          maxLength={100}
          defaultValue={draft?.tagline ?? ""}
          placeholder={t.taglineLabel}
          className={inputClass}
        />
        <input
          type="text"
          name="primaerwert"
          maxLength={50}
          defaultValue={draft?.primaerwert ?? ""}
          placeholder={t.primaerwertLabel}
          className={inputClass}
        />
        <input
          type="text"
          name="sitz"
          maxLength={200}
          defaultValue={draft?.sitz ?? ""}
          placeholder={t.sitzLabel}
          className={inputClass}
        />
        <input
          type="text"
          name="anfuehrer"
          maxLength={100}
          defaultValue={draft?.anfuehrer ?? ""}
          placeholder={t.anfuehrerLabel}
          className={inputClass}
        />
        <input
          type="text"
          name="feinde"
          maxLength={200}
          defaultValue={draft?.feinde ?? ""}
          placeholder={t.feindeLabel}
          className={`${inputClass} sm:col-span-2`}
        />
      </div>

      <textarea
        name="summary"
        maxLength={500}
        rows={2}
        defaultValue={draft?.summary ?? ""}
        placeholder={t.summaryLabel}
        className={`${inputClass} w-full`}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="url"
          name="image_url"
          defaultValue={draft?.image_url ?? ""}
          placeholder={t.imageUrlLabel}
          className={inputClass}
        />
        <input
          type="url"
          name="tabard_url"
          defaultValue={draft?.tabard_url ?? ""}
          placeholder={t.tabardUrlLabel}
          className={inputClass}
        />
        <input
          type="url"
          name="tabard_icon_url"
          defaultValue={draft?.tabard_icon_url ?? ""}
          placeholder={t.tabardIconUrlLabel}
          className={inputClass}
        />
        <input
          type="url"
          name="stylesheet_url"
          defaultValue={draft?.stylesheet_url ?? ""}
          placeholder={t.stylesheetUrlLabel}
          className={`${inputClass} sm:col-span-2`}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-parchment">{t.coreFiguresLabel}</p>
        <p className="mb-2 text-xs text-slate-500">{t.coreFiguresHint}</p>
        <div className="flex flex-col gap-2">
          {figures.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={f.icon}
                onChange={(e) => updateFigure(i, { icon: e.target.value })}
                placeholder={t.coreFigureIconPlaceholder}
                maxLength={8}
                className={`${inputClass} w-16 text-center`}
              />
              <input
                type="text"
                value={f.label}
                onChange={(e) => updateFigure(i, { label: e.target.value })}
                placeholder={t.coreFigureLabelPlaceholder}
                maxLength={60}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeFigure(i)}
                className="text-sm text-red-400 underline-offset-2 hover:underline"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFigures((prev) => [...prev, { icon: "", label: "" }])}
          className="mt-2 text-sm text-gold-light hover:underline"
        >
          {t.addCoreFigure}
        </button>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-parchment">{t.loreLabel}</p>
        <RichEditorField name="lore_html" initialHtml={draft?.lore_html ?? ""} />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-parchment">{t.rankStructureLabel}</p>
        <RichEditorField
          name="rank_structure_html"
          initialHtml={draft?.rank_structure_html ?? ""}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-gold/20 p-3">
        <p className="text-sm font-medium text-parchment">{t.tooltipSectionLabel}</p>
        <p className="text-xs text-slate-500">{t.tooltipSectionHint}</p>
        <input
          type="text"
          name="tooltip_title"
          maxLength={100}
          defaultValue={draft?.tooltip_title ?? ""}
          placeholder={t.tooltipTitleLabel}
          className={inputClass}
        />
        <textarea
          name="tooltip_meta"
          maxLength={300}
          rows={2}
          defaultValue={draft?.tooltip_meta ?? ""}
          placeholder={t.tooltipMetaLabel}
          className={`${inputClass} w-full`}
        />
        <textarea
          name="tooltip_effects"
          maxLength={1000}
          rows={3}
          defaultValue={draft?.tooltip_effects ?? ""}
          placeholder={t.tooltipEffectsLabel}
          className={`${inputClass} w-full`}
        />
        <input
          type="text"
          name="tooltip_quote"
          maxLength={300}
          defaultValue={draft?.tooltip_quote ?? ""}
          placeholder={t.tooltipQuoteLabel}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? t.saving : t.save}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-slate-400 hover:underline"
          >
            {t.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

// Hält den HTML-Wert in einem versteckten Feld, damit der RichEditor
// (kontrolliert über onChange) trotzdem Teil des normalen <form
// action={...}> FormData-Submits ist.
function RichEditorField({ name, initialHtml }: { name: string; initialHtml: string }) {
  const [html, setHtml] = useState(initialHtml);
  return (
    <>
      <input type="hidden" name={name} value={html} />
      <RichEditor initialHtml={initialHtml} onChange={setHtml} />
    </>
  );
}
