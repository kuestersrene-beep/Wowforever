"use client";

import { useEffect, useRef } from "react";

// Farben und Schrift der App (tailwind.config.ts, .panel in globals.css)
// für den eingebetteten Guide. Der Guide-Hintergrund wird durchsichtig,
// damit das Szenenbild der Seite durchscheint, und Flächen bekommen den
// Panel-Look. Die Guide-Dateien selbst bleiben unverändert.
const EMBED_CSS = `
:root[data-embed][data-theme] {
  --bg: rgba(15, 12, 10, .55);
  --surface: rgba(26, 20, 15, .8);
  --ink: #e8dfc9;
  --muted: #94a3b8;
  --line: rgba(201, 168, 106, .25);
  --gold: #e4cf9a;
  --gold-soft: rgba(201, 168, 106, .14);
  --horde: #e2725f;
  --display: var(--app-heading, "Cinzel"), Georgia, serif;
  --body: var(--app-body, "Inter"), "Segoe UI", system-ui, sans-serif;
  color-scheme: dark;
}
:root[data-embed], :root[data-embed] body { background: transparent; }
:root[data-embed] body { padding-left: 0; padding-right: 0; }
:root[data-embed] main { padding-block: 8px 48px; }
:root[data-embed] h1, :root[data-embed] h2 { color: #e4cf9a; letter-spacing: .02em; }
:root[data-embed] .watch {
  background: linear-gradient(#c9a86a, #8a6f3f); color: #0f0c0a;
  border: 1px solid rgba(201, 168, 106, .6);
}
`;

// Bettet eine Guide-Datei aus public/guides ein. Die Datei liegt auf
// derselben Domain, deshalb kann der Rahmen sie im Stil der App anzeigen
// und mit dem Inhalt mitwachsen lassen, statt selbst zu scrollen.
export default function GuideFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;

    const setup = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const root = doc.documentElement;
      root.dataset.theme = "dark";
      root.dataset.embed = "app";

      if (!doc.getElementById("app-embed")) {
        // next/font legt die App-Schriften unter gehashten Namen an. Die
        // @font-face-Regeln übernehmen wir aus der App, damit der Guide
        // dieselben Schriften nutzen kann.
        const fontFaces: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              if (rule instanceof CSSFontFaceRule) fontFaces.push(rule.cssText);
            }
          } catch {
            // fremde Stylesheets ohne Lesezugriff überspringen
          }
        }
        const appStyle = getComputedStyle(document.documentElement);
        const style = doc.createElement("style");
        style.id = "app-embed";
        style.textContent =
          fontFaces.join("\n") +
          `:root{--app-heading:${appStyle.getPropertyValue("--font-heading")};` +
          `--app-body:${appStyle.getPropertyValue("--font-body")};}` +
          EMBED_CSS;
        doc.head.appendChild(style);
      }

      const fit = () => {
        frame.style.height = `${root.scrollHeight}px`;
      };
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(doc.body);
      fit();
    };

    frame.addEventListener("load", setup);
    if (frame.contentDocument?.readyState === "complete") setup();
    return () => {
      frame.removeEventListener("load", setup);
      observer?.disconnect();
    };
  }, [src]);

  return (
    // color-scheme wie im Guide, sonst malt der Browser den Rahmen deckend aus
    <iframe
      ref={ref}
      src={src}
      title={title}
      className="min-h-[600px] w-full bg-transparent [color-scheme:dark]"
    />
  );
}
