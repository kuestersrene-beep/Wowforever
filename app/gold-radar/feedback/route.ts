import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDiscordId, getDisplayName } from "@/lib/admin";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_PER_DAY,
  hasGoldRadarAccess,
  isValidRuleset,
} from "@/lib/goldRadar";

// Nimmt Feedback aus dem Tool an (Knopf „Feedback“ in der Tool-Seite, die
// im iframe derselben Domain läuft und deshalb die Login-Cookies mitschickt).
// Gespeichert wird in gold_radar_feedback; der Betreiber sieht es unter
// /admin/gold-radar. Optional geht eine kurze Meldung an einen Discord-Kanal
// (GOLD_RADAR_FEEDBACK_WEBHOOK).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user ? getDiscordId(user) : null;
  if (!user || !discordId || !(await hasGoldRadarAccess(discordId))) {
    return NextResponse.json({ ok: false, message: "Bitte mit Discord einloggen." }, { status: 401 });
  }

  let body: { kind?: unknown; message?: unknown; ruleset?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Ungültige Anfrage." }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  const message = String(body.message ?? "").trim();
  const ruleset = typeof body.ruleset === "string" && isValidRuleset(body.ruleset) ? body.ruleset : null;
  if (!FEEDBACK_KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, message: "Bitte eine Art auswählen." }, { status: 400 });
  }
  if (message.length < 3 || message.length > FEEDBACK_MAX_CHARS) {
    return NextResponse.json(
      { ok: false, message: `Bitte 3 bis ${FEEDBACK_MAX_CHARS} Zeichen schreiben.` },
      { status: 400 }
    );
  }
  // Kontext aus dem Tool (Bereich, Item, Profil, Browser): nur flache, kurze Werte übernehmen
  const context: Record<string, string> = {};
  if (body.context && typeof body.context === "object") {
    for (const [k, v] of Object.entries(body.context as Record<string, unknown>).slice(0, 20)) {
      if (/^[a-z_]{1,30}$/.test(k) && ["string", "number", "boolean"].includes(typeof v)) {
        context[k] = String(v).slice(0, 300);
      }
    }
  }

  const db = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from("gold_radar_feedback")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .gte("created_at", since);
  if ((count ?? 0) >= FEEDBACK_PER_DAY) {
    return NextResponse.json(
      { ok: false, message: `Höchstens ${FEEDBACK_PER_DAY} Meldungen pro Tag. Danke für deinen Eifer!` },
      { status: 429 }
    );
  }

  const name = getDisplayName(user);
  const { error } = await db.from("gold_radar_feedback").insert({
    discord_id: discordId,
    display_name: name,
    ruleset,
    kind,
    message,
    context,
  });
  if (error) {
    console.error("Gold-Radar: Feedback nicht gespeichert:", error);
    return NextResponse.json({ ok: false, message: "Speichern fehlgeschlagen. Bitte später erneut." }, { status: 500 });
  }

  const hook = process.env.GOLD_RADAR_FEEDBACK_WEBHOOK;
  if (hook) {
    const where = [context.tab, context.item].filter(Boolean).join(" · ");
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Blackwater Terminal",
          allowed_mentions: { parse: [] },
          content: `**${kind}** von ${name}${where ? ` (${where})` : ""}:\n${message.slice(0, 1500)}`,
        }),
      });
    } catch (err) {
      console.error("Gold-Radar: Discord-Meldung fehlgeschlagen:", err);
    }
  }
  return NextResponse.json({ ok: true, message: "Danke! Dein Feedback ist angekommen." });
}
