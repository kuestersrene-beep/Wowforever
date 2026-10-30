"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import WowTooltipBox from "./WowTooltipBox";

// Kleines Ausrüstungs-Icon des Wappenrocks - Hover (Desktop) bzw. Tap
// (Mobile) zeigt den Tooltip daneben, genau wie beim Hover über ein
// Item-Icon im Spiel. Das Tooltip wird per Portal in document.body
// gerendert, damit es nicht am Rand der Karte abgeschnitten wird
// (gleiches Muster wie der Verfügbarkeits-Heatmap-Tooltip).
export default function TabardIcon({
  tabardUrl,
  alt,
  title,
  meta,
  effects,
  quote,
}: {
  tabardUrl: string;
  alt: string;
  title: string | null;
  meta: string | null;
  effects: string | null;
  quote: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
    });
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setOpen(false)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            show(e.currentTarget);
          }
        }}
        className="h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-[#8a6f3f] shadow-md transition hover:scale-105 hover:border-gold-light hover:shadow-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tabardUrl} alt={alt} className="h-full w-full object-cover" />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 -translate-x-1/2"
            style={{ top: pos.top, left: pos.left }}
          >
            <WowTooltipBox title={title} meta={meta} effects={effects} quote={quote} />
          </div>,
          document.body
        )}
    </>
  );
}
