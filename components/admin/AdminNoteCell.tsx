"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAdminNote } from "@/app/admin/actions";

export default function AdminNoteCell({
  userId,
  initialNote,
  placeholder,
}: {
  userId: string;
  initialNote: string | null;
  placeholder: string;
}) {
  const [value, setValue] = useState(initialNote ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = value !== (initialNote ?? "");

  const handleSave = () => {
    startTransition(async () => {
      await setAdminNote(userId, value);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        className="w-full min-w-[140px] rounded border border-gold/20 bg-ink/40 px-2 py-1 text-xs text-parchment focus:border-gold focus:outline-none"
      />
      {dirty && (
        <button
          onClick={handleSave}
          disabled={isPending}
          className="shrink-0 rounded bg-gold/20 px-2 py-1 text-xs text-gold-light hover:bg-gold/30 disabled:opacity-50"
        >
          {isPending ? "…" : "✓"}
        </button>
      )}
    </div>
  );
}
