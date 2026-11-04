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

// Eigenständig gebauter Live-Countdown (Tage/Std/Min/Sek, kompakt in den
// Gildenfarben, mit eigenem Timer-Logo) - kein Blizzard-Asset. Liest NEXT_PUBLIC_LAUNCH_DATE
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

  // Ab dem Start verschwindet der Countdown ganz (auch auf einer Seite, die
  // schon vor Mitternacht offen war)
  if (!target || !remaining || remaining.done) return null;

  const units = [
    { value: remaining.days, label: dict.home.countdownLabels.days },
    { value: remaining.hours, label: dict.home.countdownLabels.hours },
    { value: remaining.minutes, label: dict.home.countdownLabels.minutes },
    { value: remaining.seconds, label: dict.home.countdownLabels.seconds },
  ];

  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-gold-dark/70 bg-ink/70 px-3 py-2">
      <Emblem className="h-10 w-10 shrink-0" variant="timer" />
      <div className="flex items-center gap-1.5 sm:gap-2">
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-[2.25rem] text-center">
              <p className="font-heading text-lg leading-none text-gold">
                {String(u.value).padStart(2, "0")}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                {u.label}
              </p>
            </div>
            {i < units.length - 1 && <span className="-mt-3 text-gold-dark">:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
