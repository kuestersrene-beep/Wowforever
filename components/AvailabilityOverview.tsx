"use client";

import { useState } from "react";
import { DAYPARTS, WEEKDAYS } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n/types";
import type { AvailabilitySummary } from "@/lib/types";
import DiscordNameLink from "@/components/ui/DiscordNameLink";

interface SlotPerson {
  userId: string;
  discordId: string | null;
  name: string;
}

export default function AvailabilityOverview({
  rows,
  dict,
}: {
  rows: AvailabilitySummary[];
  dict: Dictionary;
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const withSlots = rows.filter((r) => r.slots.length > 0);

  const peopleBySlot = new Map<string, SlotPerson[]>();
  for (const row of withSlots) {
    const person: SlotPerson = {
      userId: row.user_id,
      discordId: row.discord_id,
      name: row.first_name ?? row.display_name ?? "?",
    };
    for (const slot of row.slots) {
      const list = peopleBySlot.get(slot);
      if (list) {
        list.push(person);
      } else {
        peopleBySlot.set(slot, [person]);
      }
    }
  }
  const maxCount = Math.max(1, ...Array.from(peopleBySlot.values(), (v) => v.length));

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
        <div className="overflow-x-auto" onClick={() => setOpenSlot(null)}>
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
                    const people = peopleBySlot.get(slot) ?? [];
                    const count = people.length;
                    const opacity = count === 0 ? 0 : 0.25 + 0.75 * (count / maxCount);
                    const isOpen = openSlot === slot;
                    return (
                      <td key={slot} className="relative px-1 py-1">
                        <button
                          type="button"
                          disabled={count === 0}
                          onMouseEnter={() => count > 0 && setOpenSlot(slot)}
                          onMouseLeave={() => setOpenSlot((s) => (s === slot ? null : s))}
                          onFocus={() => count > 0 && setOpenSlot(slot)}
                          onBlur={() => setOpenSlot((s) => (s === slot ? null : s))}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (count > 0) {
                              setOpenSlot((s) => (s === slot ? null : slot));
                            }
                          }}
                          className="flex h-8 w-full items-center justify-center rounded-lg border border-gold/20 text-xs font-medium transition disabled:cursor-default"
                          style={{
                            backgroundColor: `rgba(212, 175, 55, ${opacity})`,
                            color: opacity > 0.5 ? "#1a1310" : "#e9d9ad",
                          }}
                        >
                          {count > 0 ? count : ""}
                        </button>
                        {isOpen && (
                          <div className="absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 flex-col gap-1 whitespace-nowrap rounded-lg border border-gold/40 bg-ink px-3 py-1.5 text-xs text-parchment shadow-lg">
                            {people.map((person) => (
                              <DiscordNameLink
                                key={person.userId}
                                discordId={person.discordId}
                                name={person.name}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
