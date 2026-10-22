"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLogoScale, setLogoUrl, setTimerLogoUrl } from "@/app/admin/actions";
import { LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN } from "@/lib/constants";
import type { SiteSettings } from "@/lib/siteSettings";
import Emblem from "@/components/ui/Emblem";
import type { Dictionary } from "@/lib/i18n/types";

const isHttpsUrl = (url: string) => /^https:\/\/\S+$/.test(url);

export default function LogoSettings({
  settings,
  dict,
}: {
  settings: SiteSettings;
  dict: Dictionary;
}) {
  const { logoUrl, timerLogoUrl, logoScale } = settings;
  const [scale, setScale] = useState(logoScale);
  const [scaleSaved, setScaleSaved] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const saveScale = () => {
    setScaleSaved(false);
    setScaleError(null);
    startTransition(async () => {
      try {
        await setLogoScale(scale);
        setScaleSaved(true);
        router.refresh();
      } catch {
        setScaleError(dict.admin.logo.saveError);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-400">{dict.admin.logo.hint}</p>

        <LogoUrlField
          currentUrl={logoUrl}
          // Startseiten-Größe, mit der gerade eingestellten (noch nicht
          // gespeicherten) Größe vom Regler unten.
          current={<Emblem className="h-24 w-24" scale={scale} />}
          save={setLogoUrl}
          dict={dict}
        />

        <div className="flex flex-col gap-2 border-t border-gold/20 pt-4">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            <span>
              {dict.admin.logo.sizeLabel}:{" "}
              <strong className="text-parchment">{scale} %</strong>
            </span>
            <input
              type="range"
              min={LOGO_SCALE_MIN}
              max={LOGO_SCALE_MAX}
              step={25}
              value={scale}
              onChange={(e) => {
                setScale(Number(e.target.value));
                setScaleSaved(false);
              }}
              className="accent-gold sm:max-w-sm"
            />
          </label>
          <p className="text-xs text-slate-500">{dict.admin.logo.sizeHint}</p>
          {scaleError && <p className="text-xs text-red-400">{scaleError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveScale}
              disabled={isPending || scale === logoScale}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? dict.admin.logo.saving : dict.admin.logo.sizeSave}
            </button>
            {scale !== LOGO_SCALE_DEFAULT && (
              <button
                type="button"
                onClick={() => {
                  setScale(LOGO_SCALE_DEFAULT);
                  setScaleSaved(false);
                }}
                className="text-sm text-slate-400 underline-offset-2 hover:underline"
              >
                {dict.admin.logo.sizeDefault}
              </button>
            )}
            {scaleSaved && !isPending && (
              <span className="text-sm text-emerald-400">{dict.admin.logo.saved}</span>
            )}
          </div>
        </div>
      </div>

      <h3 className="font-heading text-base text-gold-light">
        {dict.admin.logo.timerTitle}
      </h3>
      <div className="panel flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-400">{dict.admin.logo.timerHint}</p>
        <LogoUrlField
          currentUrl={timerLogoUrl}
          current={<Emblem className="h-[4.5rem] w-[4.5rem]" variant="timer" />}
          save={setTimerLogoUrl}
          dict={dict}
        />
      </div>
    </div>
  );
}

// URL-Feld mit Live-Vorschau, Speichern und "Standard-Emblem verwenden" -
// für das Haupt-Logo und das Countdown-Logo gleich.
function LogoUrlField({
  currentUrl,
  current,
  save,
  dict,
}: {
  currentUrl: string | null;
  current: React.ReactNode;
  save: (url: string | null) => Promise<void>;
  dict: Dictionary;
}) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = url.trim();
  const isHttps = isHttpsUrl(trimmed);

  const handleSave = (next: string | null) => {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await save(next);
        setSaved(true);
        router.refresh();
      } catch {
        setError(
          next && !isHttpsUrl(next) ? dict.admin.logo.invalid : dict.admin.logo.saveError
        );
      }
    });
  };

  const handleReset = () => {
    if (!confirm(dict.admin.logo.resetConfirm)) return;
    setUrl("");
    handleSave(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-slate-500">{dict.admin.logo.current}</span>
          {current}
          {!currentUrl && (
            <span className="text-xs text-slate-500">{dict.admin.logo.defaultActive}</span>
          )}
        </div>
        {isHttps && trimmed !== currentUrl && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-500">{dict.admin.logo.preview}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={trimmed}
              src={trimmed}
              alt={dict.admin.logo.preview}
              className="h-16 w-16 object-contain"
              onLoad={() => setPreviewFailed(false)}
              onError={() => setPreviewFailed(true)}
            />
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {dict.admin.logo.urlLabel}
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
            setPreviewFailed(false);
          }}
          placeholder="https://..."
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
      </label>

      {trimmed && !isHttps && (
        <p className="text-xs text-red-400">{dict.admin.logo.invalid}</p>
      )}
      {isHttps && previewFailed && (
        <p className="text-xs text-red-400">{dict.admin.logo.loadError}</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => handleSave(trimmed)}
          disabled={isPending || !isHttps || previewFailed || trimmed === currentUrl}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.admin.logo.saving : dict.admin.logo.save}
        </button>
        {saved && !isPending && (
          <span className="text-sm text-emerald-400">{dict.admin.logo.saved}</span>
        )}
        {currentUrl && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="ml-auto text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {dict.admin.logo.reset}
          </button>
        )}
      </div>
    </div>
  );
}
