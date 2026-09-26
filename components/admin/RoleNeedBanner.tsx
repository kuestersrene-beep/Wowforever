import type { ParticipantSummary } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/types";
import { formatRoleMissing, formatRoleSummary } from "@/lib/i18n/format";

export default function RoleNeedBanner({
  responses,
  dict,
}: {
  responses: ParticipantSummary[];
  dict: Dictionary;
}) {
  const active = responses.filter(
    (r) => r.participation !== "nein" && r.role
  );
  const tank = active.filter((r) => r.role === "tank").length;
  const heiler = active.filter((r) => r.role === "heiler").length;
  const dd = active.filter((r) => r.role === "dd").length;
  const total = tank + heiler + dd;

  if (total === 0) return null;

  const missing: string[] = [];
  if (tank === 0) missing.push(dict.admin.roleNeed.tanks);
  if (heiler === 0) missing.push(dict.admin.roleNeed.healers);

  return (
    <div className="rounded-xl border border-gold bg-gold/10 p-4 text-gold-light">
      <p>{formatRoleSummary(dict, tank, heiler, dd)}</p>
      {missing.length > 0 && (
        <p className="mt-1 text-sm">
          {formatRoleMissing(dict, missing.join(" & "))}
        </p>
      )}
    </div>
  );
}
