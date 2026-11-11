import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Schnittstelle für den KI-Wochenbericht des Blackwater Terminals (geplanter Cloud-Agent).
// Ohne Login, aber nur mit dem Token aus GOLD_RADAR_NEWS_TOKEN (mindestens 32 Zeichen):
//   GET  -> die Neuigkeiten der letzten 30 Tage (neue Items im AH, Blueposts, Patchnotes) als Grundlage
//   POST -> {title, body, tags?, items?: [{id, name}]} speichert den Bericht als kind 'ki' in gold_radar_news;
//           nach Freigabe unter /admin/gold-radar zeigt ihn der Goldkalender und postet ihn der Worker in Discord.
// Liegt bewusst außerhalb von /gold-radar (dort verlangt die Middleware einen Login).

function authorized(request: NextRequest): boolean {
  const token = process.env.GOLD_RADAR_NEWS_TOKEN ?? "";
  if (token.length < 32) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Nicht erlaubt." }, { status: 401 });
  }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("gold_radar_news")
    .select("kind,title,url,body,items,tags,score,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) {
    console.error("Gold-Radar: Neuigkeiten nicht gelesen:", error);
    return NextResponse.json({ ok: false, message: "Lesen fehlgeschlagen." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, news: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Nicht erlaubt." }, { status: 401 });
  }
  let body: { title?: unknown; body?: unknown; tags?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Ungültige Anfrage." }, { status: 400 });
  }
  const title = String(body.title ?? "").trim().slice(0, 300);
  const text = String(body.body ?? "").trim().slice(0, 8000);
  if (title.length < 3 || text.length < 20) {
    return NextResponse.json({ ok: false, message: "Titel und Text fehlen." }, { status: 400 });
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 12)
    : [];
  const items = Array.isArray(body.items)
    ? body.items
        .filter((x): x is { id: unknown; name?: unknown } => !!x && typeof x === "object")
        .map((x) => ({ id: Number(x.id), name: String(x.name ?? "").slice(0, 80) }))
        .filter((x) => Number.isInteger(x.id) && x.id > 0)
        .slice(0, 30)
    : [];
  // ein Bericht pro Tag: ein zweiter am selben Tag ersetzt den ersten nicht, er wird abgewiesen
  const key = `ki:${new Date().toISOString().slice(0, 10)}`;
  const { error } = await createAdminClient()
    .from("gold_radar_news")
    .insert({ key, kind: "ki", title, body: text, tags, items, score: 10 });
  if (error) {
    const dup = error.code === "23505";
    if (!dup) console.error("Gold-Radar: KI-Bericht nicht gespeichert:", error);
    return NextResponse.json(
      { ok: false, message: dup ? "Für heute gibt es schon einen Bericht." : "Speichern fehlgeschlagen." },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, key });
}
