import { sanitizeRichHtml } from "@/lib/sanitize";

// Zeigt einen bearbeitbaren Text an (siehe lib/contentFields.ts, kind
// "rich"). Eingebaute Texte sind Klartext, Absätze mit Leerzeile ("\n\n")
// getrennt. Im Admin-Dashboard bearbeitete Texte sind HTML aus dem Editor
// und werden vor dem Anzeigen gefiltert. Nur in Server Components nutzen
// (der HTML-Filter läuft auf dem Server).
export default function RichText({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    return (
      <div
        className={`rich-text ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(value) }}
      />
    );
  }

  return (
    <div className={`rich-text ${className}`}>
      {value.split("\n\n").map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </div>
  );
}
