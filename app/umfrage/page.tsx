import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SurveyForm from "@/components/SurveyForm";
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

  const deadline = process.env.NEXT_PUBLIC_SURVEY_DEADLINE
    ? new Date(process.env.NEXT_PUBLIC_SURVEY_DEADLINE)
    : null;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Deine Antwort</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          ← Zurück
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Du kannst deine Antwort jederzeit hier ändern, solange die Umfrage
        läuft.
      </p>
      {deadline && (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold-light">
          Bitte antworte bis zum{" "}
          {deadline.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </p>
      )}
      <div className="panel p-6">
        <SurveyForm existing={existing ?? null} />
      </div>
    </main>
  );
}
