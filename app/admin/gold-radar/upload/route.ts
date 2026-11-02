import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import { DASHBOARD_FILE, GOLD_RADAR_BUCKET, MODEL_FILE, isGoldRadarOwner, isValidRuleset } from "@/lib/goldRadar";

const MAX_FILE_BYTES = 9 * 1024 * 1024;

// Lädt eine neue dashboard-teilen.html (aus ah/dashboard.py --teilen) für ein
// Ruleset hoch. Als Route statt Server Action, damit jeder Fehler als lesbare
// Meldung zurückkommt (eine geworfene Server Action zeigt im Browser nur
// „Application error: a client-side exception“).
export async function POST(request: NextRequest) {
  const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isGoldRadarOwner(getDiscordId(user))) return fail("Nicht berechtigt.", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Die Datei kam nicht vollständig an. Bitte erneut versuchen.");
  }
  const ruleset = String(form.get("ruleset") ?? "").trim();
  const file = form.get("file");
  if (!isValidRuleset(ruleset)) return fail("Ruleset nur aus Kleinbuchstaben, Ziffern und Bindestrichen.");
  if (!(file instanceof File) || file.size === 0) return fail("Keine Datei ausgewählt.");
  if (file.size > MAX_FILE_BYTES) return fail("Datei ist zu groß (max. 9 MB).", 413);

  const html = await file.text();
  // ältere Dateien heißen noch "Gold-Radar", neue "Blackwater Terminal"
  if (!html.includes("<html") || !["Gold-Radar", "Blackwater Terminal"].some((n) => html.includes(n))) {
    return fail("Das sieht nicht nach einer Blackwater-Terminal-HTML-Datei aus (dashboard-teilen.html).");
  }

  // model.html ist die Vorlage für gold-radar-worker (der baut daraus mit den
  // gemeinsamen Scans dashboard.html neu); dashboard.html sofort ersetzen,
  // damit die neue Version auch ohne laufenden Worker sichtbar ist.
  const storage = createAdminClient().storage.from(GOLD_RADAR_BUCKET);
  for (const name of [MODEL_FILE, DASHBOARD_FILE]) {
    const { error } = await storage.upload(`${ruleset}/${name}`, html, {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });
    if (error) return fail(`Speichern fehlgeschlagen (${name}): ${error.message}`, 500);
  }
  const mb = (file.size / 1_048_576).toFixed(1);
  return NextResponse.json({ ok: true, message: `Hochgeladen: ${ruleset}, ${mb} MB. Die Seite ist sofort aktiv; Preise setzt der Dienst in etwa einer Minute ein.` });
}
