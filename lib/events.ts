import type { EventSignupRow, Role } from "./types";

export interface SignupSummary {
  // Anmeldungen mit Status "dabei", nach Rolle gezählt.
  in: number;
  tentative: number;
  byRole: Record<Role, number>;
}

export function summarizeSignups(signups: EventSignupRow[]): SignupSummary {
  const byRole: Record<Role, number> = { tank: 0, heiler: 0, dd: 0 };
  let tentative = 0;
  for (const s of signups) {
    if (s.status === "dabei") byRole[s.role] += 1;
    if (s.status === "vorlaeufig") tentative += 1;
  }
  return {
    in: byRole.tank + byRole.heiler + byRole.dd,
    tentative,
    byRole,
  };
}

// Termine gelten noch einige Stunden nach Beginn als "kommend", damit
// ein laufender Raid-Abend nicht sofort unter "vergangen" rutscht.
export const UPCOMING_GRACE_MS = 6 * 60 * 60 * 1000;
