import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, getLocale } from "@/lib/i18n";
import AvailabilityForm from "@/components/AvailabilityForm";
import Emblem from "@/components/ui/Emblem";
import type { Availability } from "@/lib/types";

export default async function VerfuegbarkeitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: existing } = await supabase
    .from("availability")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Availability>();

  const dict = getDictionary(await getLocale());

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-14 w-14" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.availability.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        {dict.availability.hint}
      </p>
      <p className="text-xs text-slate-400">{dict.availability.backHint}</p>
      <div className="panel p-6">
        <AvailabilityForm existingSlots={existing?.slots ?? []} />
      </div>
    </main>
  );
}
