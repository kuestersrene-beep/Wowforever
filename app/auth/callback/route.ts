import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Discord schickt den Nutzer nach dem Login hierher zurück, im Query-
// Parameter "code" steckt ein Einmal-Code, den wir gegen eine Session
// eintauschen (setzt die Login-Cookies).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/umfrage";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=login_fehlgeschlagen`);
}
