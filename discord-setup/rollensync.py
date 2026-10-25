"""Abgleich zwischen Gilden-Website und Discord-Rollen.

Website -> Discord: Klasse und Spielrolle (Tank / Heiler / Schaden) werden als Discord-Rollen
gesetzt. Quelle sind alle Charaktere auf der Website (Main und Twinks, damit z. B. ein Tank-Twink
auch den Tank-Kanal sieht); wer keinen Charakter hat, bekommt die 1. Klassenwahl und Rolle aus
der Umfrage. Dadurch öffnen sich die
passenden Kanäle in 🧙 KLASSEN & ROLLEN von selbst. Mitglieder ohne Angaben auf der Website
werden nicht angefasst – dort vergeben Offiziere die Rollen weiter von Hand.

Discord -> Website: Die Rang-Rollen (Gildenmeister, Offizier, ...) jedes Mitglieds landen in
der Tabelle discord_members. Die Website macht daraus ihre Admin-Rechte (lib/admin.ts).

Läuft alle INTERVALL_MINUTEN, nutzt die Datenbank-Verbindung aus raid.py (SUPABASE_* in .env).
"""
import logging

import discord
from discord.ext import tasks

import raid

INTERVALL_MINUTEN = 2
GRUND = "Rollen-Sync mit der Gilden-Website"

# Rollennamen wie in server_einrichten.py
KLASSEN = raid.KLASSEN
SPIELROLLEN = {"tank": "🛡️ Tank", "heiler": "💚 Heiler", "dd": "⚔️ Schaden"}
RAENGE = ("Gildenmeister", "Offizier", "Raidleiter", "Class-Leader", "Raider", "Mitglied", "Trial", "Gast")

log = logging.getLogger("gildenbot.rollensync")
bot: discord.Client | None = None


async def sollwerte():
    """discord_id -> Menge der Discord-Rollennamen (Klassen + Spielrollen) laut Website."""
    ziel = {}
    # Umfrage zuerst, Charaktere überschreiben sie danach
    for antwort in await raid.db.lesen("responses", select="discord_id,classes,role,participation"):
        if antwort.get("participation") == "nein":
            continue
        klasse = (antwort.get("classes") or [None])[0]
        namen = rollennamen(klasse, antwort.get("role"))
        if namen:
            ziel[antwort["discord_id"]] = namen

    charaktere = await raid.db.lesen("characters", select="discord_id,class,role")
    nach_person = {}
    for c in charaktere:
        nach_person.setdefault(c["discord_id"], set()).update(rollennamen(c["class"], c["role"]))
    ziel.update({did: namen for did, namen in nach_person.items() if namen})
    return ziel


def rollennamen(klasse, spielrolle):
    namen = set()
    if klasse in KLASSEN:
        namen.add(klasse)
    if spielrolle in SPIELROLLEN:
        namen.add(SPIELROLLEN[spielrolle])
    return namen


async def rollen_abgleichen(guild, ziel):
    """Setzt bei allen Mitgliedern mit Angaben auf der Website genau die passenden Klassen- und
    Spielrollen. Gibt die Anzahl geänderter Mitglieder zurück."""
    verwaltet = {r.name: r for r in guild.roles if r.name in set(KLASSEN) | set(SPIELROLLEN.values())}
    geaendert = 0
    for member in guild.members:
        if member.bot or str(member.id) not in ziel:
            continue
        soll = {verwaltet[n] for n in ziel[str(member.id)] if n in verwaltet}
        ist = {r for r in member.roles if r.name in verwaltet}
        dazu, weg = soll - ist, ist - soll
        if not (dazu or weg):
            continue
        try:
            if dazu:
                await member.add_roles(*dazu, reason=GRUND)
            if weg:
                await member.remove_roles(*weg, reason=GRUND)
            geaendert += 1
        except discord.Forbidden:
            log.warning("Keine Berechtigung, Rollen von %s zu ändern (Bot-Rolle muss höher stehen)", member)
    return geaendert


async def raenge_speichern(guild):
    """Schreibt die Rang-Rollen aller Mitglieder nach discord_members und entfernt Ehemalige."""
    zeilen = [{"discord_id": str(m.id), "display_name": m.display_name,
               "ranks": [r.name for r in m.roles if r.name in RAENGE]}
              for m in guild.members if not m.bot]
    if not zeilen:
        return
    await raid.db.einfuegen("discord_members", zeilen, konflikt="discord_id")
    ids = ",".join(f'"{z["discord_id"]}"' for z in zeilen)
    await raid.db.loeschen("discord_members", discord_id=f"not.in.({ids})")


@tasks.loop(minutes=INTERVALL_MINUTEN)
async def abgleichen():
    guild = bot.guild if bot else None
    if raid.db is None or guild is None:
        return
    try:
        await raenge_speichern(guild)
        geaendert = await rollen_abgleichen(guild, await sollwerte())
        if geaendert:
            log.info("Rollen-Sync: %d Mitglied(er) angepasst", geaendert)
    except Exception:
        log.exception("Rollen-Sync fehlgeschlagen")


async def starten(client: discord.Client):
    """In on_ready aufrufen (nach raid.starten)."""
    global bot
    bot = client
    if raid.db is None:
        log.warning("Rollen-Sync ist aus (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen).")
        return
    if not abgleichen.is_running():
        abgleichen.start()
