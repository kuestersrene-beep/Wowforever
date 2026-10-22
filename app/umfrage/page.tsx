import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import { formatDeadline } from "@/lib/i18n/format";
import SurveyForm from "@/components/SurveyForm";
import Emblem from "@/components/ui/Emblem";
import type { SurveyResponse } from "@/lib/types";

export default async function UmfragePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: existing } = await supabase
    .from("responses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<SurveyResponse>();

  const locale = await getLocale();
  const dict = await loadDictionary(locale);

  const deadline = process.env.NEXT_PUBLIC_SURVEY_DEADLINE
    ? new Date(process.env.NEXT_PUBLIC_SURVEY_DEADLINE)
    : null;

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.survey.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <RichText
        value={dict.survey.backHint}
        className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90"
      />
      {deadline && (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold-light">
          {formatDeadline(
            dict,
            deadline.toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          )}
        </p>
      )}
      <div className="panel p-6">
        <SurveyForm existing={existing ?? null} />
      </div>
    </main>
  );
}
