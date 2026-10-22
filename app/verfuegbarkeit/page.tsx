import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
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

  const dict = await loadDictionary(await getLocale());

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.availability.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <RichText
        value={dict.availability.hint}
        className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90"
      />
      <RichText value={dict.availability.backHint} className="text-xs text-slate-400" />
      <div className="panel p-6">
        <AvailabilityForm existingSlots={existing?.slots ?? []} />
      </div>
    </main>
  );
}
