import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import LoginButton from "@/components/LoginButton";
import LogoutButton from "@/components/LogoutButton";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = user ? isAdmin(getDiscordId(user)) : false;

  return (
    <main className="flex flex-col gap-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold">World of Warcraft Forever</h1>
        <p className="mt-2 text-slate-400">
          Kurze Umfrage unter Freunden – wer ist dabei, und womit können wir
          als Gruppe rechnen?
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        {user ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-300">
              Angemeldet als <strong>{user.user_metadata?.full_name ?? user.user_metadata?.name}</strong>
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/umfrage"
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500"
              >
                Zur Umfrage
              </Link>
              <Link
                href="/uebersicht"
                className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Übersicht ansehen
              </Link>
              {admin && (
                <Link
                  href="/admin"
                  className="rounded-lg border border-amber-600 px-4 py-2 font-medium text-amber-400 transition hover:bg-amber-950"
                >
                  Admin-Dashboard
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-slate-300">
              Melde dich mit deinem Discord-Account an, um mitzumachen.
            </p>
            <div className="w-full max-w-xs">
              <LoginButton />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
        <h2 className="mb-2 font-semibold text-slate-300">Datenschutz</h2>
        <p>
          Wir speichern nur deine Discord-User-ID, deinen Anzeigenamen, dein
          Avatar-Bild und deine Antworten aus dieser Umfrage. Diese Daten
          werden ausschließlich für diese private Freundes-Umfrage genutzt.
          Du kannst deine Antwort jederzeit ändern oder auf der Umfrageseite
          vollständig löschen.
        </p>
      </section>
    </main>
  );
}
