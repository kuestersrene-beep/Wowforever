import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Discord schickt den Nutzer nach dem Login hierher zurück, im Query-
// Parameter "code" steckt ein Einmal-Code, den wir gegen eine Session
// eintauschen (setzt die Login-Cookies).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/umfrage";

  // Hinter einem Reverse-Proxy (nginx) baut Next.js die eigene Adresse
  // manchmal falsch aus der internen Bind-Adresse zusammen, statt aus der
  // echten Domain. x-forwarded-host (von nginx gesetzt) ist die
  // verlässliche Quelle dafür - offiziell von Supabase für genau dieses
  // Szenario empfohlen.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const redirectBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectBase}${next}`);
    }
  }

  return NextResponse.redirect(`${redirectBase}/?error=login_fehlgeschlagen`);
}
