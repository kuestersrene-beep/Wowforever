"""Willkommens-Nachricht per Direktnachricht an neue Mitglieder – bis zum Release.

Wer dem Server beitritt, bekommt eine private Nachricht: Begrüßung, Countdown bis zum Start und die
Bitte, sich auf der Website einzutragen, bei laufenden Abstimmungen mitzumachen und sich mit den
anderen abzusprechen. Ab RELEASE_DATUM (00:00 Uhr Ortszeit) verschickt der Bot nichts mehr.

/willkommen schickt die Nachricht zur Vorschau an einen selbst (jederzeit, auch nach dem Release).

.env (optional): RELEASE_DATUM=JJJJ-MM-TT (Standard siehe unten), SITE_URL, ZEITZONE.
Kann ein Mitglied keine Direktnachrichten empfangen, steht das im Mod-Log.
"""
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import discord
from discord import app_commands

import ereignisse
import modlog
import raid

STANDARD_RELEASE = "2026-11-05"   # wie NEXT_PUBLIC_LAUNCH_DATE der Website
AKZENTFARBE = 0xA11F2B            # Horde-Rot wie die Ankündigung auf der Website

log = logging.getLogger("gildenbot.willkommen")
bot: discord.Client | None = None


def release():
    zone = ZoneInfo(os.environ.get("ZEITZONE", "Europe/Berlin"))
    datum = os.environ.get("RELEASE_DATUM", STANDARD_RELEASE)
    try:
        return datetime.strptime(datum, "%Y-%m-%d").replace(tzinfo=zone)
    except ValueError:
        log.warning("RELEASE_DATUM %r ungültig – nutze %s", datum, STANDARD_RELEASE)
        return datetime.strptime(STANDARD_RELEASE, "%Y-%m-%d").replace(tzinfo=zone)


def vor_dem_release():
    return discord.utils.utcnow() < release()


def kanal(guild, name):
    gefunden = discord.utils.get(guild.text_channels, name=name)
    return gefunden.mention if gefunden else f"#{name}"


async def laufende_abstimmungen():
    """Fragen der aktiven Kurzabstimmungen auf der Website (falls die Datenbank angebunden ist)."""
    if raid.db is None:
        return []
    try:
        return [p["question"] for p in await raid.db.lesen("quick_polls", select="question", active="eq.true",
                                                             order="created_at.desc")]
    except Exception:
        log.exception("Kurzabstimmungen nicht lesbar")
        return []


async def nachricht(member: discord.Member):
    guild = member.guild
    start = int(release().timestamp())
    seite = os.environ.get("SITE_URL", "").rstrip("/")
    website = f"[unserer Gilden-Website]({seite})" if seite else "unserer Gilden-Website"

    embed = discord.Embed(
        title=f"⚔️ Lok'tar, {member.display_name}!",
        description=(
            f"Willkommen bei **{guild.name}**! Schön, dass du den Weg zu uns gefunden hast.\n\n"
            f"Die Kriegstrommeln schlagen schon: **WoW Forever startet <t:{start}:D>** (<t:{start}:R>). "
            "Bis dahin wollen wir möglichst viel klären, damit am ersten Abend niemand allein durchs "
            "Brachland irrt."
        ),
        color=AKZENTFARBE,
    )
    embed.add_field(name="1️⃣ Mitreden", value=(
        f"Melde dich auf {website} mit deinem Discord-Konto an und trag in der Umfrage deine "
        "**Berufe** ein – und unter Verfügbarkeit, **wann du in den ersten Wochen** spielen kannst."
    ), inline=False)

    fragen = await laufende_abstimmungen()
    if fragen:
        liste = "\n".join(f"• {f}" for f in fragen[:5])
        embed.add_field(name="2️⃣ Gerade läuft eine Abstimmung", value=(
            f"{liste}\nDeine Stimme gibst du direkt auf der Startseite der Website ab."
        ), inline=False)

    embed.add_field(name=("3️⃣" if fragen else "2️⃣") + " Absprechen", value=(
        f"Lies kurz die {kanal(guild, '📜│regeln')} und sag in {kanal(guild, '💬│allgemein')} Hallo. "
        f"Mitspieler für die ersten Quests und Dungeons findest du in {kanal(guild, '🤝│gruppensuche')}, "
        f"Raids und Anmeldungen in {kanal(guild, '🗓️│raid-planung')}."
    ), inline=False)
    embed.add_field(name="🔓 Freischaltung", value=(
        "Ein Offizier gibt dir in Kürze deine Rolle – dann öffnet sich der Rest des Servers. "
        "Sobald du auf der Website einen Charakter einträgst, bekommst du automatisch deine Klassenrolle."
    ), inline=False)
    embed.set_footer(text=f"Diese Nachricht bekommen alle neuen Mitglieder bis zum Release. · {guild.name}")
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    return embed


async def on_member_join(member: discord.Member):
    if member.bot or not bot or not bot.guild or member.guild.id != bot.guild.id or not vor_dem_release():
        return
    try:
        await member.send(embed=await nachricht(member))
    except discord.Forbidden:
        # Direktnachrichten vom Server abgeschaltet – Offiziere sollen es wissen
        await modlog.senden("✉️ Willkommens-Nachricht nicht zustellbar", modlog.FARBE_MODERATION, member,
                            [("Mitglied", member.mention),
                             ("Grund", "Das Mitglied empfängt keine Direktnachrichten von Server-Mitgliedern.")])


@app_commands.command(name="willkommen", description="Schickt dir die Begrüßung für neue Mitglieder als Vorschau")
@app_commands.guild_only()
async def vorschau(interaction: discord.Interaction):
    try:
        await interaction.user.send(embed=await nachricht(interaction.user))
        await interaction.response.send_message("📬 Ich habe dir die Begrüßung als Direktnachricht geschickt.",
                                                ephemeral=True)
    except discord.Forbidden:
        await interaction.response.send_message(
            "Ich kann dir keine Direktnachricht schicken – erlaube sie in den Privatsphäre-Einstellungen "
            "dieses Servers.", ephemeral=True)


def einrichten(client: discord.Client):
    """In setup_hook aufrufen, NACH raid.einrichten (nutzt dessen Befehlsliste, falls vorhanden)."""
    global bot
    bot = client
    ereignisse.anmelden(client, "on_member_join", on_member_join)
    if not hasattr(client, "tree"):
        client.tree = app_commands.CommandTree(client)
    client.tree.add_command(vorschau)


async def starten(client: discord.Client):
    """In on_ready aufrufen. Ohne Supabase veröffentlicht raid.py die Befehle nicht – dann hier."""
    if raid.db is None and client.guild:
        client.tree.copy_global_to(guild=client.guild)
        await client.tree.sync(guild=client.guild)
    log.info("Willkommens-Nachricht %s (Release %s)", "aktiv" if vor_dem_release() else "beendet",
             release().date())
