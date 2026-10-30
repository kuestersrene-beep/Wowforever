"""Fraktions-Entscheidung im Discord – gemeinsam mit der Gilden-Website (Supabase).

Postet in 🌐│gilden-app, welche Fraktion (siehe Website → Fraktionen) gerade zur Wahl steht
bzw. aktiviert wurde, und bearbeitet diese eine Nachricht bei jeder Änderung (Admin klickt
auf der Website "Aufheben" -> Fraktion wird aktiv -> Nachricht aktualisiert sich spätestens
nach INTERVALL_SEKUNDEN).

Nutzt dieselbe Datenbank-Verbindung wie raid.py (SUPABASE_* in .env), daher muss raid.einrichten()
vor fraktion.einrichten() und raid.starten() vor fraktion.starten() laufen (siehe bot.py).
Optional: SITE_URL (Link zur Website).
"""
import hashlib
import json
import logging
import os

import discord
from discord.ext import tasks

import raid

GILDEN_APP_KANAL = "🌐│gilden-app"
INTERVALL_SEKUNDEN = 60
AKZENTFARBE = 0xC9A227
FARBE_AKTIV = 0x2ECC71

log = logging.getLogger("gildenbot.fraktion")
bot: discord.Client | None = None
SITE_URL = ""
letzte_signatur: str | None = None


def kanal():
    return discord.utils.get(bot.guild.text_channels, name=GILDEN_APP_KANAL) if bot.guild else None


def fraktion_embed(entwuerfe):
    aktiv = next((e for e in entwuerfe if e.get("active")), None)
    if aktiv:
        teile = []
        if aktiv.get("tagline"):
            teile.append(f"*{aktiv['tagline']}*")
        if aktiv.get("summary"):
            teile.append(aktiv["summary"])
        embed = discord.Embed(
            title=f"🏆 Entscheidung gefallen: {aktiv['name']}",
            description="\n\n".join(teile) or None,
            color=FARBE_AKTIV,
        )
        bild = aktiv.get("crest_url") or aktiv.get("image_url")
        if bild:
            embed.set_thumbnail(url=bild)
    else:
        embed = discord.Embed(
            title="🛡️ Fraktion – noch offen",
            description="Zwei Entwürfe stehen zur Wahl. Schaut sie euch auf der Website an!",
            color=AKZENTFARBE,
        )
        for e in entwuerfe:
            name = e["name"] + (f" – {e['tagline']}" if e.get("tagline") else "")
            embed.add_field(name=name, value=(e.get("summary") or "–")[:200], inline=False)

    if SITE_URL:
        embed.url = f"{SITE_URL}/fraktionen"
        embed.set_footer(text="Alle Details auf der Website")
    return embed


def signatur(entwuerfe):
    roh = json.dumps(
        [{k: e.get(k) for k in
          ("id", "name", "tagline", "summary", "crest_url", "image_url", "active")}
         for e in entwuerfe],
        sort_keys=True, default=str,
    )
    return hashlib.sha1(roh.encode()).hexdigest()


async def nachricht_aktualisieren(erzwingen=False):
    global letzte_signatur
    entwuerfe = await raid.db.lesen("guild_drafts", select="*", order="sort_order.asc")
    if not entwuerfe:
        return
    sig = signatur(entwuerfe)
    if not erzwingen and sig == letzte_signatur:
        return
    embed = fraktion_embed(entwuerfe)

    einstellungen = await raid.db.lesen("site_settings", select="*", id="eq.1")
    einstellung = einstellungen[0] if einstellungen else {}
    kanal_id, nachricht_id = einstellung.get("faction_discord_channel_id"), \
        einstellung.get("faction_discord_message_id")

    if kanal_id and nachricht_id:
        alter_kanal = bot.get_channel(int(kanal_id))
        if alter_kanal:
            try:
                await alter_kanal.get_partial_message(int(nachricht_id)).edit(embed=embed)
                letzte_signatur = sig
                return
            except discord.NotFound:
                log.info("Fraktions-Nachricht fehlt – poste neu")

    ziel_kanal = kanal()
    if not ziel_kanal:
        log.warning("Kanal %s nicht gefunden", GILDEN_APP_KANAL)
        return
    nachricht = await ziel_kanal.send(embed=embed)
    await raid.db.aendern(
        "site_settings",
        {"faction_discord_channel_id": str(ziel_kanal.id), "faction_discord_message_id": str(nachricht.id)},
        id="eq.1",
    )
    letzte_signatur = sig


@tasks.loop(seconds=INTERVALL_SEKUNDEN)
async def abgleichen():
    try:
        await nachricht_aktualisieren()
    except Exception:
        log.exception("Fraktions-Abgleich fehlgeschlagen")


@abgleichen.before_loop
async def vor_dem_abgleich():
    await bot.wait_until_ready()


# ============================== EINBINDEN (aus bot.py) ==============================

def einrichten(client: discord.Client):
    """In setup_hook aufrufen."""
    global bot, SITE_URL
    bot = client
    SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")


async def starten(client: discord.Client):
    """In on_ready aufrufen, NACH raid.starten() (teilt sich dessen Datenbank-Verbindung)."""
    if raid.db is None or not client.guild:
        return
    if not abgleichen.is_running():
        abgleichen.start()
