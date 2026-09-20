"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResponse, deleteResponse } from "@/app/umfrage/actions";
import { WOW_CLASSES } from "@/lib/constants";
import type { SurveyResponse } from "@/lib/types";

export default function SurveyForm({
  existing,
}: {
  existing: SurveyResponse | null;
}) {
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
    if (!confirm("Deine Antwort wirklich vollständig löschen?")) return;
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
        <legend className="mb-1 font-medium">Dein Vorname *</legend>
        <p className="text-xs text-slate-400">
          Damit dich alle erkennen, falls jemand deinen Discord-Namen nicht
          kennt.
        </p>
        <input
          type="text"
          name="first_name"
          defaultValue={existing?.first_name ?? ""}
          required
          maxLength={100}
          placeholder="z. B. Max"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">
          1. Bist du bei WoW Forever dabei? *
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "ja", label: "Ja" },
            { value: "vielleicht", label: "Vielleicht" },
            { value: "nein", label: "Nein" },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`cursor-pointer rounded-lg border px-4 py-2 transition ${
                participation === opt.value
                  ? "border-emerald-500 bg-emerald-950 text-emerald-300"
                  : "border-slate-700 bg-slate-900 hover:bg-slate-800"
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
            <legend className="mb-1 font-medium">2. Fraktion</legend>
            <select
              name="faction"
              defaultValue={existing?.faction ?? ""}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              <option value="">Bitte wählen</option>
              <option value="horde">Horde</option>
              <option value="allianz">Allianz</option>
              <option value="egal">Egal</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">3. Spielstil</legend>
            <select
              name="playstyle"
              defaultValue={existing?.playstyle ?? ""}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              <option value="">Bitte wählen</option>
              <option value="pvp">PvP</option>
              <option value="pve">PvE</option>
              <option value="beides">Beides</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">
              4. Geplante Klasse (optional)
            </legend>
            <select
              name="class"
              defaultValue={existing?.class ?? ""}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              <option value="">Noch unklar</option>
              {WOW_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">5. Rolle (optional)</legend>
            <select
              name="role"
              defaultValue={existing?.role ?? ""}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              <option value="">Noch unklar</option>
              <option value="tank">Tank</option>
              <option value="heiler">Heiler</option>
              <option value="dd">Schadensausteiler (DD)</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">
              6. Wie oft spielst du voraussichtlich? (optional)
            </legend>
            <select
              name="frequency"
              defaultValue={existing?.frequency ?? ""}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              <option value="">Noch unklar</option>
              <option value="gelegentlich">Gelegentlich</option>
              <option value="mehrmals_woche">Mehrmals pro Woche</option>
              <option value="fast_taeglich">Fast täglich</option>
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">
              7. Kommentar (optional)
            </legend>
            <textarea
              name="comment"
              defaultValue={existing?.comment ?? ""}
              rows={3}
              maxLength={1000}
              placeholder="Alles was du sonst noch loswerden willst..."
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
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
          {isPending ? "Speichert..." : "Antwort speichern"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400">Gespeichert ✓</span>
        )}
        {existing && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline"
          >
            Antwort löschen
          </button>
        )}
      </div>
    </form>
  );
}
