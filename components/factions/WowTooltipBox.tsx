import RichText from "@/components/RichText";

// Nachgebaute Optik eines WoW-Item-Tooltips (dunkles Panel, goldener
// Rand, oranger Titel) - ein generisches UI-Muster, kein Blizzard-Asset.
// Zeigt den "lustigen" Wappenrock-Tooltip-Text, den Admins im
// Fraktions-Editor hinterlegen.
export default function WowTooltipBox({
  title,
  html,
  hint,
  className = "",
}: {
  title: string | null;
  html: string | null;
  hint?: string;
  className?: string;
}) {
  if (!title && !html) return null;

  return (
    <div
      className={`inline-block max-w-xs rounded border-2 border-[#c8aa6e] bg-black p-3 shadow-xl ${className}`}
    >
      {hint && (
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{hint}</p>
      )}
      {title && <p className="font-semibold text-[#ff8000]">{title}</p>}
      {html && (
        <RichText
          value={html}
          className="mt-1 text-sm text-[#9d9d9d] [&_p]:my-0.5 [&_p]:leading-snug"
        />
      )}
    </div>
  );
}
