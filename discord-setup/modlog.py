"""Protokoll im Offiziersbereich (🧾│mod-log): Wer ist beigetreten, wer hat welche Rolle bekommen usw.

Protokolliert werden:
- Beitritt, Verlassen, Rauswurf, Bann und Entbannung
- Rollen erhalten/entfernt, Spitzname geändert, Timeout gesetzt/aufgehoben
- gelöschte und bearbeitete Nachrichten (nur solche, die der Bot seit seinem Start gesehen hat)
- Kanäle und Rollen angelegt, gelöscht oder umbenannt

"Durch wen" liest der Bot aus dem Audit-Log des Servers (Recht "Audit-Log anzeigen"); fehlt das
Recht, steht dort nichts. Braucht den Server Members Intent (siehe README) für Beitritte und Rollen.
"""
import logging
from datetime import timedelta

import discord

import ereignisse

MODLOG_KANAL = "🧾│mod-log"

FARBE_PLUS = 0x2ECC71
FARBE_MINUS = 0xE74C3C
FARBE_AENDERUNG = 0x3498DB
FARBE_MODERATION = 0xE67E22

log = logging.getLogger("gildenbot.modlog")
bot: discord.Client | None = None


def kanal():
    return discord.utils.get(bot.guild.text_channels, name=MODLOG_KANAL) if bot and bot.guild else None


def kurz(text, laenge=1000):
    text = text or "–"
    return text if len(text) <= laenge else text[:laenge] + " …"


async def senden(titel, farbe, person=None, felder=(), beschreibung=None):
    ziel = kanal()
    if not ziel:
        return
    embed = discord.Embed(title=titel, description=beschreibung, color=farbe, timestamp=discord.utils.utcnow())
    if person:
        embed.set_author(name=f"{person} ({person.id})", icon_url=person.display_avatar.url)
    for name, wert in felder:
        embed.add_field(name=name, value=kurz(wert), inline=False)
    try:
        await ziel.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
    except discord.HTTPException:
        log.exception("Mod-Log konnte nicht senden")


async def verursacher(guild, aktion, ziel_id, sekunden=20):
    """Wer hat die Aktion ausgelöst? Sucht den passenden, frischen Audit-Log-Eintrag."""
    try:
        async for eintrag in guild.audit_logs(limit=6, action=aktion):
            frisch = discord.utils.utcnow() - eintrag.created_at < timedelta(seconds=sekunden)
            if frisch and getattr(eintrag.target, "id", None) == ziel_id:
                return eintrag.user
    except (discord.Forbidden, discord.HTTPException):
        pass
    return None


def durch(person):
    return [("Durch", person.mention)] if person else []


def ist_unser_server(guild):
    return bot.guild and guild and guild.id == bot.guild.id


# ============================== MITGLIEDER ==============================

async def on_member_join(member):
    if not ist_unser_server(member.guild):
        return
    alter = discord.utils.utcnow() - member.created_at
    hinweis = " ⚠️ neues Konto" if alter < timedelta(days=7) else ""
    await senden("📥 Beigetreten", FARBE_PLUS, member, [
        ("Mitglied", member.mention),
        ("Discord-Konto erstellt", f"{discord.utils.format_dt(member.created_at, 'D')} "
                                   f"({discord.utils.format_dt(member.created_at, 'R')}){hinweis}"),
    ])


async def on_member_remove(member):
    if not ist_unser_server(member.guild):
        return
    rauswurf = await verursacher(member.guild, discord.AuditLogAction.kick, member.id)
    rollen = ", ".join(r.mention for r in member.roles if not r.is_default()) or "–"
    if rauswurf:
        await senden("👢 Vom Server geworfen", FARBE_MODERATION, member,
                     [("Mitglied", member.mention), ("Rollen", rollen)] + durch(rauswurf))
    else:
        await senden("📤 Server verlassen", FARBE_MINUS, member, [("Mitglied", member.mention), ("Rollen", rollen)])


async def on_member_ban(guild, user):
    if ist_unser_server(guild):
        await senden("🔨 Gebannt", FARBE_MODERATION, user,
                     [("Mitglied", user.mention)] + durch(await verursacher(guild, discord.AuditLogAction.ban, user.id)))


async def on_member_unban(guild, user):
    if ist_unser_server(guild):
        await senden("♻️ Entbannt", FARBE_AENDERUNG, user,
                     [("Mitglied", user.mention)] + durch(await verursacher(guild, discord.AuditLogAction.unban, user.id)))


async def on_member_update(vorher, nachher):
    if not ist_unser_server(nachher.guild):
        return
    dazu = [r for r in nachher.roles if r not in vorher.roles]
    weg = [r for r in vorher.roles if r not in nachher.roles]
    if dazu or weg:
        wer = await verursacher(nachher.guild, discord.AuditLogAction.member_role_update, nachher.id)
        felder = [("Mitglied", nachher.mention)]
        if dazu:
            felder.append(("➕ Erhalten", ", ".join(r.mention for r in dazu)))
        if weg:
            felder.append(("➖ Entfernt", ", ".join(r.mention for r in weg)))
        await senden("🎭 Rollen geändert", FARBE_AENDERUNG, nachher, felder + durch(wer))

    if vorher.nick != nachher.nick:
        wer = await verursacher(nachher.guild, discord.AuditLogAction.member_update, nachher.id)
        await senden("✏️ Spitzname geändert", FARBE_AENDERUNG, nachher, [
            ("Mitglied", nachher.mention), ("Vorher", vorher.nick or "–"), ("Nachher", nachher.nick or "–"),
        ] + (durch(wer) if wer and wer.id != nachher.id else []))

    if vorher.timed_out_until != nachher.timed_out_until:
        wer = await verursacher(nachher.guild, discord.AuditLogAction.member_update, nachher.id)
        if nachher.timed_out_until and nachher.timed_out_until > discord.utils.utcnow():
            await senden("⏳ Timeout", FARBE_MODERATION, nachher, [
                ("Mitglied", nachher.mention), ("Bis", discord.utils.format_dt(nachher.timed_out_until, "f")),
            ] + durch(wer))
        else:
            await senden("✅ Timeout aufgehoben", FARBE_AENDERUNG, nachher, [("Mitglied", nachher.mention)] + durch(wer))


# ============================== NACHRICHTEN ==============================

def protokollieren(nachricht):
    return (nachricht.guild and ist_unser_server(nachricht.guild) and not nachricht.author.bot
            and nachricht.channel.name != MODLOG_KANAL)


async def on_message_delete(nachricht):
    if not protokollieren(nachricht):
        return
    anhaenge = "\n".join(a.url for a in nachricht.attachments)
    await senden("🗑️ Nachricht gelöscht", FARBE_MINUS, nachricht.author, [
        ("Kanal", nachricht.channel.mention),
        ("Inhalt", nachricht.content or "(kein Text)"),
    ] + ([("Anhänge", anhaenge)] if anhaenge else []))


async def on_message_edit(vorher, nachher):
    if not protokollieren(nachher) or vorher.content == nachher.content:
        return
    await senden("📝 Nachricht bearbeitet", FARBE_AENDERUNG, nachher.author, [
        ("Kanal", f"{nachher.channel.mention} · [zur Nachricht]({nachher.jump_url})"),
        ("Vorher", vorher.content or "(kein Text)"),
        ("Nachher", nachher.content or "(kein Text)"),
    ])


# ============================== KANÄLE & ROLLEN ==============================

async def on_guild_channel_create(ch):
    if ist_unser_server(ch.guild):
        wer = await verursacher(ch.guild, discord.AuditLogAction.channel_create, ch.id)
        await senden("📁 Kanal angelegt", FARBE_PLUS, felder=[("Kanal", f"{ch.mention} ({ch.name})")] + durch(wer))


async def on_guild_channel_delete(ch):
    if ist_unser_server(ch.guild):
        wer = await verursacher(ch.guild, discord.AuditLogAction.channel_delete, ch.id)
        await senden("🗑️ Kanal gelöscht", FARBE_MINUS, felder=[("Kanal", ch.name)] + durch(wer))


async def on_guild_channel_update(vorher, nachher):
    if ist_unser_server(nachher.guild) and vorher.name != nachher.name:
        wer = await verursacher(nachher.guild, discord.AuditLogAction.channel_update, nachher.id)
        await senden("✏️ Kanal umbenannt", FARBE_AENDERUNG, felder=[
            ("Kanal", nachher.mention), ("Vorher", vorher.name), ("Nachher", nachher.name)] + durch(wer))


async def on_guild_role_create(rolle):
    if ist_unser_server(rolle.guild):
        wer = await verursacher(rolle.guild, discord.AuditLogAction.role_create, rolle.id)
        await senden("🏷️ Rolle angelegt", FARBE_PLUS, felder=[("Rolle", f"{rolle.mention} ({rolle.name})")] + durch(wer))


async def on_guild_role_delete(rolle):
    if ist_unser_server(rolle.guild):
        wer = await verursacher(rolle.guild, discord.AuditLogAction.role_delete, rolle.id)
        await senden("🗑️ Rolle gelöscht", FARBE_MINUS, felder=[("Rolle", rolle.name)] + durch(wer))


async def on_guild_role_update(vorher, nachher):
    if not ist_unser_server(nachher.guild):
        return
    aenderungen = []
    if vorher.name != nachher.name:
        aenderungen.append(("Name", f"{vorher.name} → {nachher.name}"))
    if vorher.permissions != nachher.permissions:
        neu = [n for n, an in nachher.permissions if an and not getattr(vorher.permissions, n)]
        weg = [n for n, an in vorher.permissions if an and not getattr(nachher.permissions, n)]
        if neu:
            aenderungen.append(("➕ Rechte", ", ".join(neu)))
        if weg:
            aenderungen.append(("➖ Rechte", ", ".join(weg)))
    if aenderungen:
        wer = await verursacher(nachher.guild, discord.AuditLogAction.role_update, nachher.id)
        await senden("🏷️ Rolle geändert", FARBE_AENDERUNG, felder=[("Rolle", nachher.mention)] + aenderungen + durch(wer))


# ============================== EINBINDEN (aus bot.py) ==============================

EREIGNISSE = (on_member_join, on_member_remove, on_member_ban, on_member_unban, on_member_update,
              on_message_delete, on_message_edit, on_guild_channel_create, on_guild_channel_delete,
              on_guild_channel_update, on_guild_role_create, on_guild_role_delete, on_guild_role_update)


def einrichten(client: discord.Client):
    """In setup_hook aufrufen: meldet die Ereignisse beim Bot an."""
    global bot
    bot = client
    for funktion in EREIGNISSE:
        ereignisse.anmelden(client, funktion.__name__, funktion)
