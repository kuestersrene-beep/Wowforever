import type { SurveyResponse } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import { formatInsight } from "@/lib/i18n/format";

const LEAD_THRESHOLD = 0.6;

export default function InsightBanner({
  responses,
  dict,
}: {
  responses: SurveyResponse[];
  dict: Dictionary;
}) {
  const decided = responses.filter(
    (r) => r.faction === "horde" || r.faction === "allianz"
  );
  const horde = decided.filter((r) => r.faction === "horde").length;
  const allianz = decided.filter((r) => r.faction === "allianz").length;
  const total = decided.length;

  if (total === 0) return null;

  const [leaderKey, count] =
    horde >= allianz
      ? (["horde", horde] as const)
      : (["allianz", allianz] as const);
  const ratio = count / total;

  if (ratio < LEAD_THRESHOLD) return null;

  return (
    <div className="rounded-xl border border-gold bg-gold/10 p-4 text-gold-light">
      {formatInsight(dict, count, total, dict.labels.faction[leaderKey])}
    </div>
  );
}
