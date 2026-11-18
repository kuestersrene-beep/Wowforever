"""Gold-Neuigkeiten des Blackwater Terminals in Discord.

Der gold-radar-worker sammelt neue Items im AH, Blizzard-Blueposts, foreverchanges-Patchnotes und den
KI-Wochenbericht in der Tabelle gold_radar_news. Nichts davon geht von selbst raus: der Betreiber gibt jede Meldung
unter /admin/gold-radar für Discord frei (post_discord). Marin schaut jede Minute nach, postet jede freigegebene
Meldung einmal als Embed und setzt sent_at.

Zielkanal: GOLD_NEWS_KANAL_ID aus .env, sonst der Gold-News-Kanal der Gilde (STANDARD_KANAL_ID), sonst 💰│gold-news. Braucht wie die Raid-Anmeldung SUPABASE_URL
und SUPABASE_SERVICE_ROLE_KEY. GOLD_RADAR_NEWS_WEBHOOK in der .env der Website bleibt dann leer, sonst postet
zusätzlich der Worker.
"""
import logging
import os
from datetime import datetime, timezone

import discord
from discord.ext import tasks

import raid

STANDARD_KANAL = "💰│gold-news"
STANDARD_KANAL_ID = "1566824983471198360"   # Gold-News-Kanal der Gilde (11.11.2026); GOLD_NEWS_KANAL_ID überschreibt
INTERVALL_SEKUNDEN = 60
ART = {
    "item": ("🆕 Neu im AH", 0x8BE04E),
    "blue": ("📰 Bluepost", 0x00AEFF),
    "fc": ("🛠️ Patchnotes", 0xE0A84E),
    "ki": ("🧠 KI-Wochenbericht", 0xB07CE8),
}

log = logging.getLogger("gildenbot.goldnews")
bot: discord.Client | None = None
KANAL_ID = ""
SITE_URL = ""
kanal_gewarnt = False


def geld(kupfer):
    if kupfer is None:
        return "–"
    k = int(round(kupfer))
    g, s, c = k // 10000, k // 100 % 100, k % 100
    teile = [f"{g}g" if g else "", f"{s}s" if s else "", f"{c}c" if c or not (g or s) else ""]
    return " ".join(t for t in teile if t)


def zielkanal():
    if KANAL_ID:
        gefunden = bot.get_channel(int(KANAL_ID))
        if gefunden:
            return gefunden
    return discord.utils.get(bot.guild.text_channels, name=STANDARD_KANAL) if bot.guild else None


def embed_fuer(zeile):
    art, farbe = ART.get(zeile["kind"], ("Neuigkeit", 0x8BE04E))
    teile = []
    items = zeile.get("items") or []
    if items:
        teile.append("**Betrifft:** " + ", ".join(
            f"[{x.get('name') or x['id']}](https://www.wowhead.com/forever/item={x['id']})"
            + (f" ({geld(x.get('price'))}" + (f", {x['qty']} im AH" if x.get("qty") else "") + ")" if x.get("price") is not None else "")
            for x in items[:15]))
    text = (zeile.get("body") or "").strip()
    if text:
        teile.append(text[:1800] if zeile["kind"] == "ki" else (text[:350] + (" …" if len(text) > 350 else "")))
    if zeile.get("tags"):
        teile.append("Stichworte: " + ", ".join(zeile["tags"]))
    if SITE_URL:
        teile.append(f"[Im Goldkalender ansehen]({SITE_URL.rstrip('/')}/gold-radar)")
    embed = discord.Embed(title=zeile["title"][:256], url=zeile.get("url") or None, color=farbe,
                          description="\n\n".join(teile)[:4000])
    try:
        embed.timestamp = datetime.fromisoformat(zeile["created_at"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        pass
    embed.set_footer(text=f"Blackwater Terminal · {art}")
    return embed


@tasks.loop(seconds=INTERVALL_SEKUNDEN)
async def posten():
    global kanal_gewarnt
    if raid.db is None or bot is None or bot.guild is None:
        return
    try:
        offen = await raid.db.lesen("gold_radar_news", post_discord="is.true", sent_at="is.null",
                                    order="created_at.asc", limit="10")
    except Exception as fehler:   # Tabelle fehlt noch (Schema nicht eingespielt) oder Supabase kurz weg
        log.debug("Gold-News nicht lesbar: %s", fehler)
        return
    if not offen:
        return
    kanal = zielkanal()
    if kanal is None:
        if not kanal_gewarnt:
            log.warning("Gold-News: Kanal %s nicht gefunden (GOLD_NEWS_KANAL_ID setzen) – %d Meldung(en) warten",
                        KANAL_ID or STANDARD_KANAL, len(offen))
            kanal_gewarnt = True
        return
    kanal_gewarnt = False
    for zeile in offen:
        try:
            await kanal.send(embed=embed_fuer(zeile))
        except discord.HTTPException as fehler:
            log.warning("Gold-News %s nicht gepostet: %s", zeile.get("id"), fehler)
            return
        await raid.db.aendern("gold_radar_news", {"sent_at": datetime.now(timezone.utc).isoformat()}, id=f"eq.{zeile['id']}")
        log.info("Gold-News gepostet: %s", zeile["title"][:80])


async def starten(client: discord.Client):
    """In on_ready aufrufen (nach raid.starten)."""
    global bot, KANAL_ID, SITE_URL
    bot = client
    KANAL_ID = os.environ.get("GOLD_NEWS_KANAL_ID", "").strip() or STANDARD_KANAL_ID
    SITE_URL = os.environ.get("SITE_URL", "").strip()
    if raid.db is None:
        log.warning("Gold-News sind aus (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen).")
        return
    if not posten.is_running():
        posten.start()
