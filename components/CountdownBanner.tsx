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

// Eigenständig gebauter Live-Countdown (Tage/Std/Min/Sek, Sternenhimmel,
// eigenes Emblem) - kein Blizzard-Asset. Liest NEXT_PUBLIC_LAUNCH_DATE
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
      <p className="mx-auto mt-4 max-w-md rounded-xl border border-gold/40 bg-ink/60 p-4 text-center text-gold-light">
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
    <div className="starfield mx-auto mt-4 flex max-w-md items-center justify-center gap-4 rounded-xl border border-gold/40 p-4">
      <Emblem className="h-12 w-12 shrink-0" />
      <div className="flex items-center gap-2 sm:gap-3">
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center gap-2 sm:gap-3">
            <div className="text-center">
              <p className="font-heading text-xl text-parchment sm:text-2xl">
                {String(u.value).padStart(2, "0")}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gold-light">
                {u.label}
              </p>
            </div>
            {i < units.length - 1 && <span className="text-gold/50">:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
