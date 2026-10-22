"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import Emblem from "@/components/ui/Emblem";

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function getRemaining(target: number): Remaining {
  const diff = Math.max(0, target - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    done: diff <= 0,
  };
}

// Eigenständig gebauter Live-Countdown (Tage/Std/Min/Sek, in Horde-Farben
// passend zum Ankündigungs-Panel der Startseite, mit eigenem Timer-Logo) - kein Blizzard-Asset. Liest NEXT_PUBLIC_LAUNCH_DATE
// selbst aus (als NEXT_PUBLIC_-Variable ohnehin im Client-Bundle
// vorhanden), rendert nichts, falls die Variable nicht gesetzt ist.
export default function CountdownBanner() {
  const { dict } = useI18n();
  const targetIso = process.env.NEXT_PUBLIC_LAUNCH_DATE;
  const target = targetIso ? new Date(targetIso).getTime() : null;

  // Start bewusst mit null, damit Server- und erstes Client-Rendering
  // übereinstimmen (kein Hydration-Mismatch durch die tickende Zeit).
  // Der echte Wert wird erst im Effekt gesetzt.
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    if (!target) return;
    setRemaining(getRemaining(target));
    const id = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target || !remaining) return null;

  if (remaining.done) {
    return (
      <p className="mx-auto max-w-md rounded-xl border border-horde/60 bg-ink/50 p-4 text-center font-heading text-red-200">
        {dict.home.countdownToday}
      </p>
    );
  }

  const units = [
    { value: remaining.days, label: dict.home.countdownLabels.days },
    { value: remaining.hours, label: dict.home.countdownLabels.hours },
    { value: remaining.minutes, label: dict.home.countdownLabels.minutes },
    { value: remaining.seconds, label: dict.home.countdownLabels.seconds },
  ];

  return (
    <div className="mx-auto flex max-w-md items-center justify-center gap-4 rounded-xl border border-horde/60 bg-gradient-to-b from-ink/70 to-horde-dark/60 p-4 shadow-inner shadow-black/50">
      <Emblem className="h-[4.5rem] w-[4.5rem] shrink-0" variant="timer" />
      <div className="flex items-center gap-2 sm:gap-3">
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center gap-2 sm:gap-3">
            <div className="text-center">
              <p className="font-heading text-xl text-parchment sm:text-2xl">
                {String(u.value).padStart(2, "0")}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-red-300">
                {u.label}
              </p>
            </div>
            {i < units.length - 1 && <span className="text-horde">:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
