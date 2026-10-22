import sanitizeHtml from "sanitize-html";

// Erlaubt nur die Formatierungen, die der Editor erzeugen kann. Alles
// andere (Skripte, Styles, Event-Handler, Bilder, iframes ...) wird
// entfernt. Wird beim Speichern UND beim Anzeigen angewendet.
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "a", "ul", "ol", "li"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      // Links immer in neuem Tab und ohne Zugriff auf diese Seite öffnen.
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}
