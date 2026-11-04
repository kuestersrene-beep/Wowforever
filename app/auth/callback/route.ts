import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Discord schickt den Nutzer nach dem Login hierher zurück, im Query-
// Parameter "code" steckt ein Einmal-Code, den wir gegen eine Session
// eintauschen (setzt die Login-Cookies).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Zurück dorthin, wo der Login gestartet wurde - das merkt sich LoginButton
  // im Cookie "login_next" (nicht in der Adresse: Supabase akzeptiert nur
  // Rücksprung-Adressen, die genau in seiner Erlaubt-Liste stehen). Sonst in
  // die Gildenhalle. Nur eigene Pfade - "//andere-seite.de" oder volle
  // Adressen würden sonst auf fremde Seiten weiterleiten.
  const cookieStore = await cookies();
  const requested = decodeURIComponent(cookieStore.get("login_next")?.value ?? "/");
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  cookieStore.delete("login_next");

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
