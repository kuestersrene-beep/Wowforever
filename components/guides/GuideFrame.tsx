"use client";

import { useEffect, useRef } from "react";

// Farben und Schrift der App (tailwind.config.ts, .panel in globals.css)
// für den eingebetteten Guide. Der Guide-Hintergrund wird durchsichtig,
// damit das Szenenbild der Seite durchscheint, und Flächen bekommen den
// Panel-Look. Die Guide-Dateien selbst bleiben unverändert.
const EMBED_CSS = `
:root[data-embed][data-theme] {
  --bg: rgba(10, 12, 9, .6);
  --surface: rgba(18, 22, 15, .9);
  --ink: #e9e6da;
  --muted: #a4ac98;
  --line: rgba(139, 224, 78, .22);
  --gold: #a6e86f;
  --gold-soft: rgba(139, 224, 78, .12);
  --horde: #f2b66b;
  --display: var(--app-heading, "Cinzel"), Georgia, serif;
  --body: var(--app-body, "Inter"), "Segoe UI", system-ui, sans-serif;
  color-scheme: dark;
}
:root[data-embed], :root[data-embed] body { background: transparent; }
:root[data-embed] body { padding-left: 0; padding-right: 0; }
:root[data-embed] main { padding-block: 8px 48px; }
:root[data-embed] h1, :root[data-embed] h2 { color: #e9e6da; letter-spacing: .02em; }
:root[data-embed] .watch {
  background: #8be04e; color: #0a0c09;
  border: 1px solid #4f8a2a;
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
