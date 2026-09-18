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

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deine Antwort</h1>
        <Link href="/" className="text-sm text-slate-400 hover:underline">
          ← Zurück
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Du kannst deine Antwort jederzeit hier ändern, solange die Umfrage
        läuft.
      </p>
      <SurveyForm existing={existing ?? null} />
    </main>
  );
}
