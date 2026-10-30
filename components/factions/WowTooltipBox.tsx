// Nachgebaute Optik eines WoW-Item-Tooltips (dunkles Panel, goldener
// Rand) mit den im Spiel üblichen Textfarben - ein generisches
// UI-Muster, kein Blizzard-Asset. title in episch-lila, meta-Zeilen in
// Weiß, jede Effekt-Zeile in Grün, die Flavor-Zeile am Ende in Orange -
// exakt wie im echten Item-Tooltip.
export default function WowTooltipBox({
  title,
  meta,
  effects,
  quote,
  className = "",
}: {
  title: string | null;
  meta: string | null;
  effects: string | null;
  quote: string | null;
  className?: string;
}) {
  if (!title && !meta && !effects && !quote) return null;

  const metaLines = (meta ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const effectLines = (effects ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div
      className={`inline-block max-w-xs rounded border-2 border-[#c8aa6e] bg-black p-3 shadow-xl ${className}`}
    >
      {title && (
        <p className="font-semibold" style={{ color: "#a335ee" }}>
          {title}
        </p>
      )}
      {metaLines.map((line, i) => (
        <p key={i} className="text-sm text-white">
          {line}
        </p>
      ))}
      {effectLines.map((line, i) => (
        <p key={i} className="text-sm" style={{ color: "#1eff00" }}>
          {line}
        </p>
      ))}
      {quote && (
        <p className="mt-1 text-sm italic" style={{ color: "#e6cc80" }}>
          „{quote}&rdquo;
        </p>
      )}
    </div>
  );
}
