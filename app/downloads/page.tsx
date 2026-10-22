import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, getLocale } from "@/lib/i18n";
import Emblem from "@/components/ui/Emblem";
import type { DownloadItem } from "@/lib/types";

export default async function DownloadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const dict = getDictionary(await getLocale());

  const { data: downloads } = await supabase
    .from("downloads")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<DownloadItem[]>();

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.downloads.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="text-sm text-slate-400">{dict.downloads.hint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(downloads ?? []).map((d) => (
          <div
            key={d.id}
            className="panel flex flex-col items-center gap-3 p-6 text-center"
          >
            <h2 className="font-heading text-base text-gold-light">{d.title}</h2>
            {d.description && (
              <p className="text-sm text-slate-400">{d.description}</p>
            )}
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className={
                d.image_url
                  ? "rounded-xl border border-gold/40 bg-ink/40 p-2 transition hover:border-gold/70 hover:brightness-110"
                  : "rounded-lg border border-gold/60 bg-gradient-to-b from-gold to-gold-dark px-4 py-2 font-medium text-ink transition hover:brightness-110"
              }
            >
              {d.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.image_url}
                  alt={d.title}
                  width={96}
                  height={96}
                  className="h-24 w-24"
                />
              ) : (
                dict.downloads.downloadButton
              )}
            </a>
          </div>
        ))}
        {(downloads ?? []).length === 0 && (
          <p className="col-span-full text-center text-sm text-slate-500">
            {dict.downloads.empty}
          </p>
        )}
      </div>
    </main>
  );
}
