"use client";

import { useState } from "react";
import EventForm from "@/components/events/EventForm";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { GuildEvent } from "@/lib/types";

// Admin-Knopf "Termin bearbeiten" auf der Detailseite, der das
// vorausgefüllte Formular aufklappt.
export default function EventEditToggle({ event }: { event: GuildEvent }) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);

  if (open) {
    return <EventForm event={event} onDone={() => setOpen(false)} />;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="self-start rounded-lg border border-gold-dark px-4 py-2 text-sm font-medium text-gold-light transition hover:bg-gold/10"
    >
      ✎ {dict.events.admin.edit}
    </button>
  );
}
