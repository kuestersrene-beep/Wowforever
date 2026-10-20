import { DAYPARTS, WEEKDAYS } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n/types";
import type { AvailabilitySummary, Daypart, Weekday } from "@/lib/types";

export default function AvailabilityOverview({
  rows,
  dict,
}: {
  rows: AvailabilitySummary[];
  dict: Dictionary;
}) {
  const withSlots = rows.filter((r) => r.slots.length > 0);

  const counts = new Map<string, number>();
  for (const row of withSlots) {
    for (const slot of row.slots) {
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(1, ...counts.values());

  return (
    <section className="panel flex flex-col gap-4 p-6">
      <div>
        <h2 className="heading-ornate text-lg">{dict.overview.availabilityTitle}</h2>
        <p className="mt-1 text-sm text-slate-400">{dict.overview.availabilityHint}</p>
      </div>

      {withSlots.length === 0 ? (
        <p className="text-sm text-slate-500">
          {dict.overview.availabilityHeatmapEmpty}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1" />
                  {WEEKDAYS.map((day) => (
                    <th key={day} className="px-2 py-1 font-medium text-gold-light">
                      {dict.labels.weekday[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYPARTS.map((part) => (
                  <tr key={part}>
                    <th className="px-2 py-1 text-right text-xs font-normal text-slate-400">
                      {dict.labels.daypart[part]}
                    </th>
                    {WEEKDAYS.map((day) => {
                      const slot = `${day}_${part}`;
                      const count = counts.get(slot) ?? 0;
                      const opacity = count === 0 ? 0 : 0.25 + 0.75 * (count / maxCount);
                      return (
                        <td key={slot} className="px-1 py-1">
                          <div
                            className="flex h-8 w-full items-center justify-center rounded-lg border border-gold/20 text-xs font-medium text-ink"
                            style={{
                              backgroundColor: `rgba(212, 175, 55, ${opacity})`,
                              color: opacity > 0.5 ? "#1a1310" : "#e9d9ad",
                            }}
                          >
                            {count > 0 ? count : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-1 text-sm">
            {withSlots.map((row) => (
              <li key={row.user_id} className="text-slate-300">
                <span className="font-medium text-parchment">
                  {row.first_name ?? row.display_name ?? "?"}
                </span>
                {": "}
                {formatSlots(row.slots, dict)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function formatSlots(slots: string[], dict: Dictionary): string {
  return slots
    .map((slot) => {
      const [day, part] = slot.split("_") as [Weekday, Daypart];
      const dayLabel = dict.labels.weekday[day];
      const partLabel = dict.labels.daypart[part];
      if (!dayLabel || !partLabel) return null;
      return `${dayLabel} ${partLabel.toLowerCase()}`;
    })
    .filter(Boolean)
    .join(", ");
}
