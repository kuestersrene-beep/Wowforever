import type { SurveyResponse } from "@/lib/types";

export default function RoleNeedBanner({
  responses,
}: {
  responses: SurveyResponse[];
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
  if (tank === 0) missing.push("Tanks");
  if (heiler === 0) missing.push("Heiler");

  return (
    <div className="rounded-xl border border-gold bg-gold/10 p-4 text-gold-light">
      <p>
        <strong>{tank}</strong> Tank{tank === 1 ? "" : "s"} ·{" "}
        <strong>{heiler}</strong> Heiler · <strong>{dd}</strong> DDs
        angemeldet.
      </p>
      {missing.length > 0 && (
        <p className="mt-1 text-sm">
          Noch gesucht: {missing.join(" und ")}!
        </p>
      )}
    </div>
  );
}
