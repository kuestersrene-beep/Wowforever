import type { SurveyResponse } from "@/lib/types";

const LEAD_THRESHOLD = 0.6;

export default function InsightBanner({
  responses,
}: {
  responses: SurveyResponse[];
}) {
  const decided = responses.filter(
    (r) => r.faction === "horde" || r.faction === "allianz"
  );
  const horde = decided.filter((r) => r.faction === "horde").length;
  const allianz = decided.filter((r) => r.faction === "allianz").length;
  const total = decided.length;

  if (total === 0) return null;

  const [leader, count] =
    horde >= allianz ? (["Horde", horde] as const) : (["Allianz", allianz] as const);
  const ratio = count / total;

  if (ratio < LEAD_THRESHOLD) return null;

  return (
    <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-4 text-amber-200">
      <strong>{count} von {total}</strong> mit Fraktionswunsch wollen{" "}
      <strong>{leader}</strong> spielen.
    </div>
  );
}
