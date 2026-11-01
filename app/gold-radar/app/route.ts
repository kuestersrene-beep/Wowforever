import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId } from "@/lib/admin";
import {
  defaultRuleset,
  hasGoldRadarAccess,
  isValidRuleset,
  loadDashboard,
  logUsage,
} from "@/lib/goldRadar";

// Liefert die eigentliche Tool-Seite (eine fertige HTML-Datei aus dem
// privaten Storage) aus - nur mit Discord-Login und Zugangsrolle. Wird von
// /gold-radar im iframe geladen, funktioniert aber auch im eigenen Tab.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user ? getDiscordId(user) : null;

  if (!user || !discordId) {
    return new NextResponse("Bitte zuerst mit Discord einloggen.", { status: 401 });
  }

  const ruleset = request.nextUrl.searchParams.get("r") ?? defaultRuleset();
  if (!isValidRuleset(ruleset)) {
    return new NextResponse("Unbekanntes Ruleset.", { status: 400 });
  }

  if (!(await hasGoldRadarAccess(discordId))) {
    await logUsage(user, discordId, "denied", ruleset);
    return new NextResponse("Kein Zugang zum Gold-Radar.", { status: 403 });
  }

  const html = await loadDashboard(ruleset);
  if (!html) {
    return new NextResponse("Für dieses Ruleset sind noch keine Daten hochgeladen.", { status: 404 });
  }

  await logUsage(user, discordId, "open", ruleset);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Persönlicher Inhalt hinter Login: nie in geteilten Caches ablegen.
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Robots-Tag": "noindex",
    },
  });
}
