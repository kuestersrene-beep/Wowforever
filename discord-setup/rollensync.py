"""Abgleich zwischen Gilden-Website und Discord-Rollen.

Website -> Discord: Klasse und Spielrolle (Tank / Heiler / Schaden) werden als Discord-Rollen
gesetzt. Quelle sind alle Charaktere auf der Website (Main und Twinks, damit z. B. ein Tank-Twink
auch den Tank-Kanal sieht); wer keinen Charakter hat, bekommt die 1. Klassenwahl und Rolle aus
der Umfrage. Dadurch öffnen sich die
passenden Kanäle in 🧙 KLASSEN & ROLLEN von selbst. Mitglieder ohne Angaben auf der Website
werden nicht angefasst – dort vergeben Offiziere die Rollen weiter von Hand.

Discord -> Website: Die Rang-Rollen (Gildenmeister, Offizier, ...) und Zugangsrollen (Gold-Radar)
jedes Mitglieds landen in der Tabelle discord_members. Die Website macht daraus ihre Admin-Rechte
(lib/admin.ts) und den Zugang zu Modulen wie dem Gold-Radar (lib/goldRadar.ts).

Läuft alle INTERVALL_MINUTEN, nutzt die Datenbank-Verbindung aus raid.py (SUPABASE_* in .env).
"""
import logging
from datetime import datetime, timedelta
import os

import discord
from discord.ext import tasks

import raid

INTERVALL_MINUTEN = 2
GRUND = "Rollen-Sync mit der Gilden-Website"
# Nach so vielen Tagen als Hatchling erinnert der Bot die Offiziere an die Beförderung
PROBEZEIT_TAGE = int(os.getenv("HATCHLING_TAGE", "14"))
OFFIZIERS_KANAL = "🛡️│offiziers-chat"

# Rollennamen wie in server_einrichten.py
KLASSEN = raid.KLASSEN
SPIELROLLEN = {"tank": "🛡️ Tank", "heiler": "💚 Heiler", "dd": "⚔️ Schaden"}
RAENGE = ("Gildenmeister", "Offizier", "Raidleiter", "Class-Leader", "Raider", "Mitglied", "Trial", "Hatchling",
          "Gast")
GILDENRAENGE = tuple(r for r in RAENGE if r != "Gast")
# Zugangsrollen für Website-Module, landen ebenfalls in discord_members.ranks
# (Website: GOLD_RADAR_ROLES in lib/goldRadar.ts). Weitere per .env, kommagetrennt.
ZUGANGSROLLEN = tuple(r.strip() for r in os.getenv("ZUGANGSROLLEN", "Gold-Radar,Beta-Tester").split(",") if r.strip())

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
        # Klassen- und Spielrollen öffnen die Kanäle in 🧙 KLASSEN & ROLLEN - die sind für die Gilde,
        # also nur für Mitglieder mit Rang (ab Trial), nicht für Gäste oder Neue
        if not any(r.name in GILDENRAENGE for r in member.roles):
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
               "ranks": [r.name for r in m.roles if r.name in RAENGE + ZUGANGSROLLEN]}
              for m in guild.members if not m.bot]
    if not zeilen:
        return
    await raid.db.einfuegen("discord_members", zeilen, konflikt="discord_id")
    ids = ",".join(f'"{z["discord_id"]}"' for z in zeilen)
    await raid.db.loeschen("discord_members", discord_id=f"not.in.({ids})")
    await rang_seit_pflegen(zeilen)


async def rang_seit_pflegen(zeilen):
    """Merkt sich in discord_rank_since, seit wann jemand welchen Rang hat (auf INTERVALL_MINUTEN genau)."""
    soll = {(z["discord_id"], r) for z in zeilen for r in z["ranks"] if r in RAENGE}
    ist = {(z["discord_id"], z["rank"]) for z in await raid.db.lesen("discord_rank_since", select="discord_id,rank")}
    neu = [{"discord_id": d, "rank": r} for d, r in soll - ist]
    if neu:
        await raid.db.einfuegen("discord_rank_since", neu, konflikt="discord_id,rank")
    for d, r in ist - soll:
        await raid.db.loeschen("discord_rank_since", discord_id=f"eq.{d}", rank=f"eq.{r}")


async def hatchlings_erinnern(guild):
    """Erinnert die Offiziere einmal pro Person, wenn jemand PROBEZEIT_TAGE lang Hatchling ist."""
    # Ohne "+00:00" (das "+" würde in der Adresse zum Leerzeichen)
    grenze = (discord.utils.utcnow() - timedelta(days=PROBEZEIT_TAGE)).strftime("%Y-%m-%dT%H:%M:%SZ")
    faellig = await raid.db.lesen("discord_rank_since", select="discord_id,since", rank="eq.Hatchling",
                                  reminded="eq.false", since=f"lte.{grenze}")
    kanal = discord.utils.get(guild.text_channels, name=OFFIZIERS_KANAL)
    if not faellig or not kanal:
        return
    zeilen = []
    for f in faellig:
        seit = datetime.fromisoformat(f["since"].replace("Z", "+00:00"))
        zeilen.append(f"• <@{f['discord_id']}> – Hatchling seit {discord.utils.format_dt(seit, 'D')} "
                      f"({(discord.utils.utcnow() - seit).days} Tage)")
    embed = discord.Embed(
        title="🐣 Bereit zur Beförderung?",
        description=(f"Diese Neuzugänge sind seit mindestens {PROBEZEIT_TAGE} Tagen Hatchling. "
                     "Passt es? Dann bitte zum **Mitglied** befördern.\n\n" + "\n".join(zeilen))[:4000],
        color=0xA6D67E,
    )
    await kanal.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
    for f in faellig:
        await raid.db.aendern("discord_rank_since", {"reminded": True},
                              discord_id=f"eq.{f['discord_id']}", rank="eq.Hatchling")


@tasks.loop(minutes=INTERVALL_MINUTEN)
async def abgleichen():
    guild = bot.guild if bot else None
    if raid.db is None or guild is None:
        return
    # Beide Richtungen getrennt absichern: Fehlt z. B. die Tabelle discord_members (Schema noch
    # nicht eingespielt), sollen die Klassen- und Spielrollen trotzdem gesetzt werden.
    try:
        geaendert = await rollen_abgleichen(guild, await sollwerte())
        if geaendert:
            log.info("Rollen-Sync: %d Mitglied(er) angepasst", geaendert)
    except Exception:
        log.exception("Rollen-Sync (Website -> Discord) fehlgeschlagen")
    try:
        await raenge_speichern(guild)
    except Exception:
        log.exception("Ränge an die Website melden fehlgeschlagen – ist supabase/schema.sql eingespielt?")
    try:
        await hatchlings_erinnern(guild)
    except Exception:
        log.exception("Hatchling-Erinnerung fehlgeschlagen")


async def starten(client: discord.Client):
    """In on_ready aufrufen (nach raid.starten)."""
    global bot
    bot = client
    if raid.db is None:
        log.warning("Rollen-Sync ist aus (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen).")
        return
    if not abgleichen.is_running():
        abgleichen.start()
