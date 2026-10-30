"""Hinweis-Liste im Mod-Log: wer hat die Umfrage ausgefüllt, ist aber noch nicht im Discord-Server.

Marin kann neuen Teilnehmer:innen keine Direktnachricht schicken, solange sie nicht Mitglied des
Servers sind – Discord lässt Bot-DMs nur an Personen zu, mit denen ein gemeinsamer Server besteht,
und genau das ist bei "hat die Umfrage ausgefüllt, aber noch nicht beigetreten" per Definition
nicht der Fall. Stattdessen postet der Bot im 🧾│mod-log eine Liste, wen die Offiziere noch
persönlich einladen können – eine einzelne Nachricht, die bei jeder Änderung aktualisiert wird
(gleiches Muster wie fraktion.py), statt bei jedem Abgleich neu zu posten.

Nutzt dieselbe Datenbank-Verbindung wie raid.py (SUPABASE_* in .env), daher muss raid.einrichten()
vor einladung.einrichten() und raid.starten() vor einladung.starten() laufen (siehe bot.py).
Zielkanal: 🧾│mod-log (siehe modlog.py) – fehlt der Kanal, passiert nichts.
"""
import hashlib
import json
import logging

import discord
from discord.ext import tasks

import modlog
import raid

INTERVALL_SEKUNDEN = 300
AKZENTFARBE = 0xC9A227

log = logging.getLogger("gildenbot.einladung")
bot: discord.Client | None = None
letzte_signatur: str | None = None


async def fehlende():
    """Teilnehmer:innen der Umfrage (participation != 'nein'), deren Discord-ID nicht in
    discord_members steht – also noch nicht im Server."""
    antworten = await raid.db.lesen("responses", select="discord_id,display_name,first_name,participation")
    mitglieder = {m["discord_id"] for m in await raid.db.lesen("discord_members", select="discord_id")}
    return sorted(
        (a for a in antworten if a["participation"] != "nein" and a["discord_id"] not in mitglieder),
        key=lambda a: (a.get("first_name") or a["display_name"]).lower(),
    )


def liste_embed(personen):
    if not personen:
        embed = discord.Embed(
            title="🎉 Alle im Discord!",
            description="Niemand aus der Umfrage fehlt gerade im Server.",
            color=AKZENTFARBE,
        )
    else:
        zeilen = "\n".join(
            f"• **{p.get('first_name') or p['display_name']}** (`{p['display_name']}`) – "
            f"<@{p['discord_id']}> · ID `{p['discord_id']}`"
            for p in personen
        )
        embed = discord.Embed(
            title=f"📋 {len(personen)} Person(en) aus der Umfrage noch nicht im Discord",
            description=(
                "Marin kann diese Leute nicht selbst anschreiben (Discord erlaubt Bot-DMs nur an "
                "Server-Mitglieder) – bitte wer sie kennt, persönlich einladen:\n\n" + zeilen
            ),
            color=AKZENTFARBE,
        )
    embed.set_footer(text="Aktualisiert sich automatisch, sobald sich die Liste ändert")
    return embed


def signatur(personen):
    roh = json.dumps([p["discord_id"] for p in personen], sort_keys=True)
    return hashlib.sha1(roh.encode()).hexdigest()


async def nachricht_aktualisieren(erzwingen=False):
    global letzte_signatur
    personen = await fehlende()
    sig = signatur(personen)
    if not erzwingen and sig == letzte_signatur:
        return
    embed = liste_embed(personen)

    einstellungen = await raid.db.lesen("site_settings", select="*", id="eq.1")
    einstellung = einstellungen[0] if einstellungen else {}
    kanal_id, nachricht_id = einstellung.get("invite_discord_channel_id"), \
        einstellung.get("invite_discord_message_id")

    if kanal_id and nachricht_id:
        alter_kanal = bot.get_channel(int(kanal_id))
        if alter_kanal:
            try:
                await alter_kanal.get_partial_message(int(nachricht_id)).edit(embed=embed)
                letzte_signatur = sig
                return
            except discord.NotFound:
                log.info("Einladungs-Hinweis fehlt – poste neu")

    ziel_kanal = modlog.kanal()
    if not ziel_kanal:
        log.warning("Mod-Log-Kanal nicht gefunden")
        return
    nachricht = await ziel_kanal.send(embed=embed)
    await raid.db.aendern(
        "site_settings",
        {"invite_discord_channel_id": str(ziel_kanal.id), "invite_discord_message_id": str(nachricht.id)},
        id="eq.1",
    )
    letzte_signatur = sig


@tasks.loop(seconds=INTERVALL_SEKUNDEN)
async def abgleichen():
    try:
        await nachricht_aktualisieren()
    except Exception:
        log.exception("Einladungs-Abgleich fehlgeschlagen")


@abgleichen.before_loop
async def vor_dem_abgleich():
    await bot.wait_until_ready()


# ============================== EINBINDEN (aus bot.py) ==============================

def einrichten(client: discord.Client):
    """In setup_hook aufrufen."""
    global bot
    bot = client


async def starten(client: discord.Client):
    """In on_ready aufrufen, NACH raid.starten() (teilt sich dessen Datenbank-Verbindung)."""
    if raid.db is None or not client.guild:
        return
    if not abgleichen.is_running():
        abgleichen.start()
