"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDownload, deleteDownload } from "@/app/admin/actions";
import type { Dictionary } from "@/lib/i18n/types";
import type { DownloadItem } from "@/lib/types";

export default function DownloadsManager({
  downloads,
  dict,
}: {
  downloads: DownloadItem[];
  dict: Dictionary;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const handleAdd = (formData: FormData) => {
    startTransition(async () => {
      await addDownload(formData);
      formRef.current?.reset();
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(dict.downloads.admin.deleteConfirm)) return;
    startTransition(async () => {
      await deleteDownload(id);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-slate-800 panel">
        {downloads.map((d) => (
          <li key={d.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium text-parchment">{d.title}</p>
              {d.description && (
                <p className="text-xs text-slate-400">{d.description}</p>
              )}
              <p className="truncate text-xs text-slate-500">{d.url}</p>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(d.id)}
              disabled={isPending}
              className="text-sm text-red-400 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {dict.downloads.admin.deleteButton}
            </button>
          </li>
        ))}
        {downloads.length === 0 && (
          <li className="p-4 text-center text-sm text-slate-500">
            {dict.downloads.empty}
          </li>
        )}
      </ul>

      <form
        ref={formRef}
        action={handleAdd}
        className="panel flex flex-col gap-3 p-4"
      >
        <h3 className="font-heading text-sm text-gold-light">
          {dict.downloads.admin.addTitle}
        </h3>
        <input
          type="text"
          name="title"
          required
          maxLength={200}
          placeholder={dict.downloads.admin.titleLabel}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          placeholder={dict.downloads.admin.descriptionLabel}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
        <input
          type="url"
          name="url"
          required
          placeholder={dict.downloads.admin.urlLabel}
          className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
        />
        <div>
          <input
            type="text"
            name="image_url"
            placeholder={dict.downloads.admin.imageUrlLabel}
            className="w-full rounded-lg border border-gold/30 bg-panel px-3 py-2 text-parchment focus:border-gold focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            {dict.downloads.admin.imageUrlHint}
          </p>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? dict.downloads.admin.adding : dict.downloads.admin.addButton}
        </button>
      </form>
    </div>
  );
}
