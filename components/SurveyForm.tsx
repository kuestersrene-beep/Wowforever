"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResponse, deleteResponse } from "@/app/umfrage/actions";
import { CLASS_PRIORITY_COUNT, WOW_CLASSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { formatPrioNone } from "@/lib/i18n/format";
import type { SurveyResponse } from "@/lib/types";

export default function SurveyForm({
  existing,
}: {
  existing: SurveyResponse | null;
}) {
  const { dict } = useI18n();
  const [participation, setParticipation] = useState(
    existing?.participation ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const showRest = participation === "ja" || participation === "vielleicht";

  const handleSubmit = (formData: FormData) => {
    setSaved(false);
    startTransition(async () => {
      await saveResponse(formData);
      setSaved(true);
    });
  };

  const handleDelete = () => {
    if (!confirm(dict.survey.deleteConfirm)) return;
    startTransition(async () => {
      await deleteResponse();
      router.refresh();
      setParticipation("");
      setSaved(false);
    });
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{dict.survey.firstNameLabel}</legend>
        <p className="text-xs text-slate-400">{dict.survey.firstNameHint}</p>
        <input
          type="text"
          name="first_name"
          defaultValue={existing?.first_name ?? ""}
          required
          maxLength={100}
          placeholder={dict.survey.firstNamePlaceholder}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{dict.survey.q1Legend}</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "ja", label: dict.labels.participation.ja },
            { value: "vielleicht", label: dict.labels.participation.vielleicht },
            { value: "nein", label: dict.labels.participation.nein },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`cursor-pointer rounded-lg border px-4 py-2 transition ${
                participation === opt.value
                  ? "border-gold bg-gold/20 text-gold-light"
                  : "border-gold/20 bg-panel hover:bg-gold/10"
              }`}
            >
              <input
                type="radio"
                name="participation"
                value={opt.value}
                checked={participation === opt.value}
                onChange={(e) => setParticipation(e.target.value)}
                required
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {showRest && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q2Legend}</legend>
            <select
              name="faction"
              defaultValue={existing?.faction ?? ""}
              className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
            >
              <option value="">{dict.survey.pleaseChoose}</option>
              <option value="horde">{dict.labels.faction.horde}</option>
              <option value="allianz">{dict.labels.faction.allianz}</option>
              <option value="egal">{dict.labels.faction.egal}</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q3Legend}</legend>
            <select
              name="playstyle"
              defaultValue={existing?.playstyle ?? ""}
              className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
            >
              <option value="">{dict.survey.pleaseChoose}</option>
              <option value="pvp">{dict.labels.playstyle.pvp}</option>
              <option value="pve">{dict.labels.playstyle.pve}</option>
              <option value="beides">{dict.labels.playstyle.beides}</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q4Legend}</legend>
            <p className="text-xs text-slate-400">{dict.survey.q4Hint}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {Array.from({ length: CLASS_PRIORITY_COUNT }, (_, i) => i + 1).map(
                (prio) => (
                  <select
                    key={prio}
                    name={`class_prio_${prio}`}
                    defaultValue={existing?.classes?.[prio - 1] ?? ""}
                    className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
                  >
                    <option value="">{formatPrioNone(dict, prio)}</option>
                    {WOW_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {dict.labels.class[c]}
                      </option>
                    ))}
                  </select>
                )
              )}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q5Legend}</legend>
            <select
              name="role"
              defaultValue={existing?.role ?? ""}
              className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
            >
              <option value="">{dict.survey.notSureYet}</option>
              <option value="tank">{dict.labels.role.tank}</option>
              <option value="heiler">{dict.labels.role.heiler}</option>
              <option value="dd">{dict.labels.role.dd}</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q6Legend}</legend>
            <select
              name="frequency"
              defaultValue={existing?.frequency ?? ""}
              className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
            >
              <option value="">{dict.survey.notSureYet}</option>
              <option value="gelegentlich">
                {dict.labels.frequency.gelegentlich}
              </option>
              <option value="mehrmals_woche">
                {dict.labels.frequency.mehrmals_woche}
              </option>
              <option value="fast_taeglich">
                {dict.labels.frequency.fast_taeglich}
              </option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{dict.survey.q7Legend}</legend>
            <textarea
              name="comment"
              defaultValue={existing?.comment ?? ""}
              rows={3}
              maxLength={1000}
              placeholder={dict.survey.commentPlaceholder}
              className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
            />
          </fieldset>
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !participation}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.survey.saving : dict.survey.save}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400">{dict.survey.saved}</span>
        )}
        {existing && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline"
          >
            {dict.survey.deleteButton}
          </button>
        )}
      </div>
    </form>
  );
}
