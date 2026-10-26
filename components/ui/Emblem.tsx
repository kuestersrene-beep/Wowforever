"use client";

import { useState } from "react";
import { useBranding } from "@/lib/branding";

// Standardhöhe des Haupt-Logos bei 100 % (6rem = 96 px, wie das Emblem
// in den Seitenköpfen).
const LOGO_BASE_HEIGHT_REM = 6;

// Eigenständig entworfenes Emblem - keine Blizzard-Assets. Ein
// Kompass-Rahmen um einen zweigeteilten Horde/Allianz-Kreis, in der
// Mitte zwei verschlungene Ringe als Sinnbild für "für immer verbunden,
// egal welche Fraktion".
function starPoints(
  cx: number,
  cy: number,
  spikes: number,
  outerR: number,
  innerR: number
): string {
  const points: string[] = [];
  const step = Math.PI / spikes;
  let angle = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    angle += step;
  }
  return points.join(" ");
}

// Zeigt das im Admin-Dashboard hinterlegte Logo, falls gesetzt - sonst
// (oder wenn das Bild nicht lädt) das eingebaute Emblem. Beim Emblem wird
// die eingestellte Größe per CSS "zoom" auf die Standardgröße (className)
// angewendet - anders als transform: scale() verschiebt zoom auch das
// Layout, nichts überlappt.
// "scale" überschreibt die gespeicherte Größe (für die Admin-Vorschau).
// variant="timer" nutzt stattdessen das separate Countdown-Logo, immer in
// Originalgröße (der Größenregler gilt nur für das Haupt-Logo).
export default function Emblem({
  className = "h-20 w-20",
  scale,
  variant = "main",
}: {
  className?: string;
  scale?: number;
  variant?: "main" | "timer";
}) {
  const branding = useBranding();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const logoUrl = variant === "timer" ? branding.timerLogoUrl : branding.logoUrl;
  const style =
    variant === "timer" ? {} : { zoom: (scale ?? branding.logoScale) / 100 };

  if (logoUrl && failedUrl !== logoUrl) {
    if (variant === "timer") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Logo"
          className={`${className} object-contain`}
          onError={() => setFailedUrl(logoUrl)}
        />
      );
    }

    // Eigenes Haupt-Logo in beliebigem Seitenverhältnis (z. B. eine
    // rechteckige Kopfgrafik): Die Höhe ist begrenzt (Standardhöhe x
    // Größenregler), die Breite ergibt sich aus dem Seitenverhältnis und
    // ist höchstens so breit wie die Seite. Ein quadratisches Logo wird
    // dadurch genauso groß wie bisher, eine 3:1-Grafik dreimal so breit.
    const maxHeightRem = (LOGO_BASE_HEIGHT_REM * (scale ?? branding.logoScale)) / 100;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt="Logo"
        className="mx-auto block h-auto w-auto max-w-full object-contain"
        style={{ maxHeight: `${maxHeightRem}rem` }}
        onError={() => setFailedUrl(logoUrl)}
      />
    );
  }

  return <DefaultEmblem className={className} style={style} />;
}

function DefaultEmblem({
  className,
  style,
}: {
  className: string;
  style: React.CSSProperties;
}) {
  const cx = 50;
  const cy = 50;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      role="img"
      aria-label="WoW Forever Emblem"
    >
      <defs>
        <clipPath id="emblem-left-half">
          <rect x={cx - 40} y={cy - 40} width={40} height={80} />
        </clipPath>
        <clipPath id="emblem-right-half">
          <rect x={cx} y={cy - 40} width={40} height={80} />
        </clipPath>
      </defs>

      <polygon
        points={starPoints(cx, cy, 8, 49, 40)}
        fill="none"
        stroke="#c9a86a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <circle cx={cx} cy={cy} r={36} fill="#a11f2b" clipPath="url(#emblem-left-half)" />
      <circle cx={cx} cy={cy} r={36} fill="#2b5f9e" clipPath="url(#emblem-right-half)" />
      <circle cx={cx} cy={cy} r={36} fill="none" stroke="#c9a86a" strokeWidth="2" />
      <line x1={cx} y1={cy - 36} x2={cx} y2={cy + 36} stroke="#c9a86a" strokeWidth="1" />

      <circle cx={cx - 5} cy={cy} r={9} fill="none" stroke="#e4cf9a" strokeWidth="3" />
      <circle cx={cx + 5} cy={cy} r={9} fill="none" stroke="#e4cf9a" strokeWidth="3" />
    </svg>
  );
}
