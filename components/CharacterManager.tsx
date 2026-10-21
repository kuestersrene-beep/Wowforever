"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCharacter, saveCharacter } from "@/app/charaktere/actions";
import { ROLES, WOW_CLASSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Character, Role } from "@/lib/types";

const inputClass =
  "rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none";

export default function CharacterManager({
  characters,
  prefill,
}: {
  characters: Character[];
  prefill: { class: string; role: Role } | null;
}) {
  const { dict } = useI18n();
  const [editing, setEditing] = useState<Character | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await saveCharacter(formData);
      setEditing(null);
      formRef.current?.reset();
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(dict.characters.deleteConfirm)) return;
    startTransition(async () => {
      await deleteCharacter(id);
      if (editing?.id === id) setEditing(null);
      router.refresh();
    });
  };

  const defaults = editing ?? {
    name: "",
    class: prefill?.class ?? "",
    role: prefill?.role ?? "",
    level: 1,
    is_main: characters.length === 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="panel flex flex-col divide-y divide-slate-800">
        {characters.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <p className="flex items-center gap-2 font-medium text-parchment">
                {c.name}
                {c.is_main && (
                  <span className="rounded border border-gold/40 px-1 text-[10px] uppercase text-gold">
                    {dict.characters.mainBadge}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400">
                {dict.labels.class[c.class] ?? c.class} ·{" "}
                {dict.labels.role[c.role]} · {dict.characters.levelLabel} {c.level}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(c)}
              disabled={isPending}
              className="text-sm text-gold-light underline-offset-2 hover:underline disabled:opacity-50"
            >
              {dict.characters.edit}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              disabled={isPending}
              className="text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {dict.characters.deleteButton}
            </button>
          </li>
        ))}
        {characters.length === 0 && (
          <li className="p-4 text-center text-sm text-slate-500">
            {dict.characters.noneYet}
          </li>
        )}
      </ul>

      {/* key erzwingt ein frisches Formular, wenn zwischen "neu" und
          "bearbeiten" gewechselt wird (defaultValue greift nur beim Mount). */}
      <form
        key={editing?.id ?? "new"}
        ref={formRef}
        action={handleSubmit}
        className="panel flex flex-col gap-3 p-4"
      >
        <h3 className="font-heading text-sm text-gold-light">
          {editing ? dict.characters.editTitle : dict.characters.addTitle}
        </h3>
        {!editing && prefill && characters.length === 0 && (
          <p className="text-xs text-slate-400">{dict.characters.prefillHint}</p>
        )}
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
            {dict.characters.nameLabel}
            <input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={24}
              defaultValue={defaults.name}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            {dict.characters.classLabel}
            <select
              name="class"
              required
              defaultValue={defaults.class}
              className={inputClass}
            >
              <option value="" disabled>
                {dict.survey.pleaseChoose}
              </option>
              {WOW_CLASSES.map((cls) => (
                <option key={cls} value={cls}>
                  {dict.labels.class[cls] ?? cls}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            {dict.characters.levelLabel}
            <input
              type="number"
              name="level"
              min={1}
              max={100}
              defaultValue={defaults.level}
              className={inputClass}
            />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs text-slate-400">
            {dict.characters.roleLabel}
          </legend>
          {ROLES.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gold/20 px-3 py-1.5 text-sm text-parchment has-[:checked]:border-gold has-[:checked]:bg-gold/20"
            >
              <input
                type="radio"
                name="role"
                value={role}
                required
                defaultChecked={defaults.role === role}
                className="accent-gold"
              />
              {dict.labels.role[role]}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-parchment">
          <input
            type="checkbox"
            name="is_main"
            defaultChecked={defaults.is_main}
            className="accent-gold"
          />
          {dict.characters.mainLabel}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? dict.characters.saving : dict.characters.save}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-sm text-slate-400 underline-offset-2 hover:underline"
            >
              {dict.characters.cancel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
