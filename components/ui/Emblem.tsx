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

export default function Emblem({ className = "h-20 w-20" }: { className?: string }) {
  const cx = 50;
  const cy = 50;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
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
