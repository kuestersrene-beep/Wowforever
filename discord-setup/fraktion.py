"""Fraktions-Entscheidung im Discord – gemeinsam mit der Gilden-Website (Supabase).

Zwei Nachrichten, die sich bei jeder Änderung selbst bearbeiten (spätestens nach INTERVALL_SEKUNDEN):

- Öffentlich: welche Gildenentwürfe (siehe Website → Fraktionen) zur Wahl stehen bzw. welcher
  aktiviert wurde (Admin klickt auf der Website "Aufheben"). Ohne Stimmenzahlen, damit niemand
  beeinflusst wird. Zielkanal: FRAKTION_KANAL_ID aus .env, sonst 🌐│gilden-app.
- Nur Offiziere: der Stimmenstand je Entwurf aus guild_draft_votes, live wie auf der Website im
  Admin-Bereich. Zielkanal: FRAKTION_STIMMEN_KANAL_ID aus .env, sonst 🛡️│offiziers-chat.

Wo die öffentliche Nachricht steht, liegt in site_settings, die Offiziers-Nachricht merkt sich der
Bot in DATEN_ORDNER (fraktion_stimmen.json).

Nutzt dieselbe Datenbank-Verbindung wie raid.py (SUPABASE_* in .env), daher muss raid.einrichten()
vor fraktion.einrichten() und raid.starten() vor fraktion.starten() laufen (siehe bot.py).
Optional: SITE_URL (Link zur Website), FRAKTION_KANAL_ID, FRAKTION_STIMMEN_KANAL_ID.
"""
import hashlib
import json
import logging
import os
from pathlib import Path

import discord
from discord.ext import tasks

import raid

GILDEN_APP_KANAL = "🌐│gilden-app"
OFFIZIERS_KANAL = "🛡️│offiziers-chat"
INTERVALL_SEKUNDEN = 60
AKZENTFARBE = 0xC9A227
FARBE_AKTIV = 0x2ECC71
FARBE_STIMMEN = 0xC0392B

log = logging.getLogger("gildenbot.fraktion")
bot: discord.Client | None = None
SITE_URL = ""
KANAL_ID = ""
STIMMEN_KANAL_ID = ""
STIMMEN_DATEI = Path(os.environ.get("DATEN_ORDNER", Path(__file__).resolve().parent / "data")) / "fraktion_stimmen.json"
letzte_signatur: str | None = None
letzte_stimmen_signatur: str | None = None


def kanal(kanal_id, standard_name):
    if kanal_id:
        gefunden = bot.get_channel(int(kanal_id))
        if gefunden:
            return gefunden
        log.warning("Kanal-ID %s nicht gefunden – weiche auf %s aus", kanal_id, standard_name)
    return discord.utils.get(bot.guild.text_channels, name=standard_name) if bot.guild else None


def mehrzahl(anzahl):
    return f"{anzahl} {'Stimme' if anzahl == 1 else 'Stimmen'}"


def balken(anteil, breite=12):
    voll = round(anteil * breite)
    return "█" * voll + "░" * (breite - voll)


def stimmen_text(anzahl, gesamt):
    anteil = anzahl / gesamt if gesamt else 0
    return f"`{balken(anteil)}` **{mehrzahl(anzahl)}** · {round(anteil * 100)} %"


def mit_website_link(embed):
    if SITE_URL:
        embed.url = f"{SITE_URL}/fraktionen"
        embed.set_footer(text="Alle Details auf der Website")
    return embed


def fraktion_embed(entwuerfe):
    """Öffentliche Nachricht – bewusst ohne Stimmenzahlen."""
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
            description=f"{len(entwuerfe)} Entwürfe stehen zur Wahl. Schaut sie euch auf der Website an und stimmt ab!",
            color=AKZENTFARBE,
        )
        for e in entwuerfe:
            name = e["name"] + (f" – {e['tagline']}" if e.get("tagline") else "")
            embed.add_field(name=name[:256], value=(e.get("summary") or "–")[:200], inline=False)
    return mit_website_link(embed)


def stimmen_embed(entwuerfe, stimmen):
    """Offiziers-Nachricht mit dem Stimmenstand je Entwurf."""
    gesamt = sum(stimmen.get(e["id"], 0) for e in entwuerfe)
    hoechste = max((stimmen.get(e["id"], 0) for e in entwuerfe), default=0)
    fuehrend = [e["id"] for e in entwuerfe if hoechste and stimmen.get(e["id"], 0) == hoechste]
    aktiv = next((e for e in entwuerfe if e.get("active")), None)
    embed = discord.Embed(
        title=f"📊 Endergebnis – gewählt: {aktiv['name']}" if aktiv else "📊 Gildenentwurf – Stimmenstand",
        description=f"🔒 Nur für Offiziere sichtbar · bisher **{mehrzahl(gesamt)}**",
        color=FARBE_AKTIV if aktiv else FARBE_STIMMEN,
        timestamp=discord.utils.utcnow(),
    )
    for e in entwuerfe:
        # Eindeutige Führung bekommt eine Krone, bei Gleichstand niemand
        krone = "👑 " if fuehrend == [e["id"]] else ""
        embed.add_field(name=(krone + e["name"])[:256], value=stimmen_text(stimmen.get(e["id"], 0), gesamt),
                        inline=False)
    mit_website_link(embed)
    embed.set_footer(text="Stand")
    return embed


def signatur(*teile):
    return hashlib.sha1(json.dumps(teile, sort_keys=True, default=str).encode()).hexdigest()


async def stimmen_zaehlen():
    """Stimmen je Entwurf aus guild_draft_votes (service_role sieht alle Zeilen trotz RLS)."""
    stimmen = {}
    for zeile in await raid.db.lesen("guild_draft_votes", select="draft_id"):
        stimmen[zeile["draft_id"]] = stimmen.get(zeile["draft_id"], 0) + 1
    return stimmen


async def posten_oder_bearbeiten(embed, kanal_id, nachricht_id, ziel):
    """Bearbeitet die gemerkte Nachricht oder postet neu. Gibt (kanal_id, nachricht_id) zurück,
    wenn neu gepostet wurde, sonst None."""
    if kanal_id and nachricht_id:
        alter_kanal = bot.get_channel(int(kanal_id))
        if alter_kanal:
            try:
                await alter_kanal.get_partial_message(int(nachricht_id)).edit(embed=embed)
                return None
            except discord.NotFound:
                log.info("Fraktions-Nachricht fehlt – poste neu")
    if not ziel:
        raise RuntimeError("Zielkanal für die Fraktions-Nachricht nicht gefunden")
    nachricht = await ziel.send(embed=embed)
    return str(ziel.id), str(nachricht.id)


async def oeffentlich_aktualisieren(entwuerfe, erzwingen):
    global letzte_signatur
    sig = signatur([{k: e.get(k) for k in ("id", "name", "tagline", "summary", "crest_url", "image_url", "active")}
                    for e in entwuerfe])
    if not erzwingen and sig == letzte_signatur:
        return
    einstellungen = await raid.db.lesen("site_settings", select="*", id="eq.1")
    einstellung = einstellungen[0] if einstellungen else {}
    neu = await posten_oder_bearbeiten(fraktion_embed(entwuerfe), einstellung.get("faction_discord_channel_id"),
                                       einstellung.get("faction_discord_message_id"),
                                       kanal(KANAL_ID, GILDEN_APP_KANAL))
    if neu:
        await raid.db.aendern("site_settings", {"faction_discord_channel_id": neu[0],
                                                "faction_discord_message_id": neu[1]}, id="eq.1")
    letzte_signatur = sig


async def stimmen_aktualisieren(entwuerfe, erzwingen):
    global letzte_stimmen_signatur
    stimmen = await stimmen_zaehlen()
    sig = signatur([(e["id"], e["name"], e.get("active")) for e in entwuerfe], stimmen)
    if not erzwingen and sig == letzte_stimmen_signatur:
        return
    gemerkt = json.loads(STIMMEN_DATEI.read_text(encoding="utf-8")) if STIMMEN_DATEI.exists() else {}
    neu = await posten_oder_bearbeiten(stimmen_embed(entwuerfe, stimmen), gemerkt.get("kanal_id"),
                                       gemerkt.get("nachricht_id"), kanal(STIMMEN_KANAL_ID, OFFIZIERS_KANAL))
    if neu:
        STIMMEN_DATEI.parent.mkdir(parents=True, exist_ok=True)
        STIMMEN_DATEI.write_text(json.dumps({"kanal_id": neu[0], "nachricht_id": neu[1]}), encoding="utf-8")
    letzte_stimmen_signatur = sig


async def nachricht_aktualisieren(erzwingen=False):
    entwuerfe = await raid.db.lesen("guild_drafts", select="*", order="sort_order.asc,created_at.asc")
    if not entwuerfe:
        return
    await oeffentlich_aktualisieren(entwuerfe, erzwingen)
    await stimmen_aktualisieren(entwuerfe, erzwingen)


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
    global bot, SITE_URL, KANAL_ID, STIMMEN_KANAL_ID
    bot = client
    SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
    KANAL_ID = os.environ.get("FRAKTION_KANAL_ID", "").strip()
    STIMMEN_KANAL_ID = os.environ.get("FRAKTION_STIMMEN_KANAL_ID", "").strip()


async def starten(client: discord.Client):
    """In on_ready aufrufen, NACH raid.starten() (teilt sich dessen Datenbank-Verbindung)."""
    if raid.db is None or not client.guild:
        return
    if not abgleichen.is_running():
        abgleichen.start()
