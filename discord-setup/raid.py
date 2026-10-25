"""Raid-Anmeldung im Discord – gemeinsam mit der Gilden-Website (Supabase).

Ein Termin ist auf der Website (Termine & Raids) und im Discord derselbe:
- Termine, die auf der Website angelegt werden, postet der Bot automatisch im Raid-Kanal.
- /raid neu legt Termine direkt aus Discord an (nur Raidleitung).
- Anmeldung per Button an der Raid-Nachricht: Tank / Heiler / DD / Vorläufig / Abmelden.
  Wer auf der Website einen Charakter hat (characters.discord_id), wird mit diesem angemeldet,
  alle anderen landen in discord_event_signups.
- Die Nachricht aktualisiert sich bei Änderungen (spätestens nach SYNC_SEKUNDEN),
  die Anmeldung schließt zur Startzeit, ERINNERUNG_MINUTEN vorher gibt es eine Erinnerung.
- /raid fehlende, /raid schliessen, /raid oeffnen, /raid absagen für die Raidleitung.

Braucht SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env, sonst bleibt das Modul aus.
Optional: SITE_URL (Link zur Website), ZEITZONE (Standard Europe/Berlin).
Im Developer Portal muss zusätzlich der "Server Members Intent" an sein (für /raid fehlende).
"""
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import aiohttp
import discord
from discord import app_commands
from discord.ext import tasks

# Kanal- und Rollennamen wie in server_einrichten.py
RAID_KANAL = "📅│raid-ankündigungen"
RAIDLEITUNG_ROLLEN = ("Raidleiter", "Offizier", "Gildenmeister")
RAIDER_ROLLE = "Raider"

SYNC_SEKUNDEN = 60
ERINNERUNG_MINUTEN = 60
NACHLAUF_STUNDEN = 6        # so lange nach Start wird die Nachricht noch aktualisiert
STANDARD_PLAETZE = 20

# Klassen wie auf der Website (lib/constants.ts, WOW_CLASSES)
KLASSEN = ["Krieger", "Paladin", "Jäger", "Schurke", "Priester", "Schamane", "Magier", "Hexenmeister", "Druide"]
ROLLEN = {"tank": ("🛡️", "Tank", "Tanks"), "heiler": ("💚", "Heiler", "Heiler"), "dd": ("⚔️", "DD", "DDs")}
STATUS = {"dabei": "Dabei", "vorlaeufig": "Vorläufig", "abgemeldet": "Abgemeldet"}

AKZENTFARBE = 0xC9A227
FARBE_GESCHLOSSEN = 0x5D6470
FARBE_ABGESAGT = 0xA11F2B

log = logging.getLogger("gildenbot.raid")


# ============================== DATENBANK (Supabase REST) ==============================

class Datenbank:
    """Schmaler Zugriff auf die Supabase-REST-API mit dem service_role Key."""

    def __init__(self, url, schluessel):
        self.basis = url.rstrip("/") + "/rest/v1/"
        self.kopf = {"apikey": schluessel, "Authorization": f"Bearer {schluessel}",
                     "Content-Type": "application/json"}
        self.session: aiohttp.ClientSession | None = None

    async def _anfrage(self, methode, tabelle, params=None, daten=None, prefer=None):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20))
        kopf = dict(self.kopf)
        if prefer:
            kopf["Prefer"] = prefer
        async with self.session.request(methode, self.basis + tabelle, params=params,
                                        data=json.dumps(daten) if daten is not None else None,
                                        headers=kopf) as antwort:
            text = await antwort.text()
            if antwort.status >= 400:
                raise RuntimeError(f"Supabase {methode} {tabelle}: {antwort.status} {text[:300]}")
            return json.loads(text) if text else None

    async def lesen(self, tabelle, **filter):
        return await self._anfrage("GET", tabelle, params=filter) or []

    async def einfuegen(self, tabelle, zeilen, konflikt=None):
        params = {"on_conflict": konflikt} if konflikt else None
        prefer = "return=representation" + (",resolution=merge-duplicates" if konflikt else "")
        return await self._anfrage("POST", tabelle, params=params, daten=zeilen, prefer=prefer) or []

    async def aendern(self, tabelle, werte, **filter):
        await self._anfrage("PATCH", tabelle, params=filter, daten=werte, prefer="return=minimal")

    async def loeschen(self, tabelle, **filter):
        await self._anfrage("DELETE", tabelle, params=filter, prefer="return=minimal")


db: Datenbank | None = None
bot: discord.Client | None = None
ZONE = ZoneInfo("Europe/Berlin")
SITE_URL = ""
# Zuletzt gerenderter Stand je Termin, damit Nachrichten nur bei Änderungen bearbeitet werden.
signaturen: dict[str, str] = {}


def jetzt():
    return datetime.now(timezone.utc)


def zeit(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def ist_raidleitung(member):
    return member.guild_permissions.administrator or any(r.name in RAIDLEITUNG_ROLLEN for r in member.roles)


def raid_kanal():
    return discord.utils.get(bot.guild.text_channels, name=RAID_KANAL) if bot.guild else None


async def termin_laden(eid):
    zeilen = await db.lesen("events", id=f"eq.{eid}", select="*")
    return zeilen[0] if zeilen else None


async def anmeldungen_laden(eid):
    return await db.lesen("event_signups_overview", event_id=f"eq.{eid}", select="*", order="updated_at.asc")


def anmeldung_offen(termin):
    return not termin.get("signups_closed") and jetzt() < zeit(termin["starts_at"])


# ============================== DARSTELLUNG ==============================

def zeile(a):
    marke = {"bestaetigt": "✅ ", "bank": "🪑 "}.get(a.get("roster_slot"), "")
    klasse = f" – {a['class']}" if a.get("class") else ""
    return f"{marke}{a['character_name']}{klasse}"


def feldwert(zeilen, leer="–"):
    text = "\n".join(zeilen) or leer
    return text if len(text) <= 1024 else text[:1000] + "\n…"


def raid_embed(termin, anmeldungen, abgesagt=False):
    start = int(zeit(termin["starts_at"]).timestamp())
    offen = anmeldung_offen(termin) and not abgesagt
    teile = [f"🗓️ <t:{start}:F> · <t:{start}:R>"]
    if termin.get("instance"):
        teile.append(f"📍 {termin['instance']}")
    if termin.get("description"):
        teile.append("\n" + termin["description"][:1500])
    embed = discord.Embed(
        title=("❌ ABGESAGT – " if abgesagt else "") + termin["title"],
        description="\n".join(teile),
        color=FARBE_ABGESAGT if abgesagt else (AKZENTFARBE if offen else FARBE_GESCHLOSSEN),
    )
    if SITE_URL and not abgesagt:
        embed.url = f"{SITE_URL}/termine/{termin['id']}"

    dabei = [a for a in anmeldungen if a["status"] == "dabei"]
    for rolle, (emoji, _einzahl, mehrzahl) in ROLLEN.items():
        in_rolle = [a for a in dabei if a.get("role") == rolle]
        embed.add_field(name=f"{emoji} {mehrzahl} ({len(in_rolle)})",
                        value=feldwert([zeile(a) for a in in_rolle]), inline=True)
    vorlaeufig = [a for a in anmeldungen if a["status"] == "vorlaeufig"]
    abgemeldet = [a for a in anmeldungen if a["status"] == "abgemeldet"]
    if vorlaeufig:
        embed.add_field(name=f"❔ Vorläufig ({len(vorlaeufig)})",
                        value=feldwert([zeile(a) for a in vorlaeufig]), inline=False)
    if abgemeldet:
        embed.add_field(name=f"✖️ Abgemeldet ({len(abgemeldet)})",
                        value=feldwert([", ".join(a["character_name"] for a in abgemeldet)]), inline=False)

    if abgesagt:
        fuss = "Dieser Termin wurde abgesagt."
    elif offen:
        fuss = f"{len(dabei)}/{termin['max_size']} dabei · Klick unten auf deine Rolle, um dich anzumelden"
    else:
        fuss = f"{len(dabei)}/{termin['max_size']} dabei · Anmeldung geschlossen"
    embed.set_footer(text=fuss + ("  ·  ✅ bestätigt  🪑 Bank" if not abgesagt else ""))
    return embed


def raid_ansicht(termin):
    offen = anmeldung_offen(termin)
    ansicht = discord.ui.View(timeout=None)
    for aktion in ("tank", "heiler", "dd", "vorlaeufig", "ab", "klasse"):
        knopf = RaidKnopf(aktion, termin["id"])
        knopf.item.disabled = not offen
        ansicht.add_item(knopf)
    return ansicht


def signatur(termin, anmeldungen):
    roh = json.dumps([
        {k: termin.get(k) for k in ("title", "instance", "description", "starts_at", "max_size", "signups_closed")},
        anmeldung_offen(termin),
        sorted((a["discord_id"], a["status"], a.get("role"), a.get("class"), a["character_name"],
                a.get("roster_slot")) for a in anmeldungen),
    ], sort_keys=True, default=str)
    return hashlib.sha1(roh.encode()).hexdigest()


async def nachricht_aktualisieren(termin, erzwingen=False):
    """Postet den Termin im Raid-Kanal bzw. bearbeitet die vorhandene Nachricht."""
    anmeldungen = await anmeldungen_laden(termin["id"])
    sig = signatur(termin, anmeldungen)
    if not erzwingen and signaturen.get(termin["id"]) == sig and termin.get("discord_message_id"):
        return
    embed, ansicht = raid_embed(termin, anmeldungen), raid_ansicht(termin)

    if termin.get("discord_message_id") and termin.get("discord_channel_id"):
        kanal = bot.get_channel(int(termin["discord_channel_id"]))
        if kanal:
            try:
                await kanal.get_partial_message(int(termin["discord_message_id"])).edit(embed=embed, view=ansicht)
                signaturen[termin["id"]] = sig
                return
            except discord.NotFound:
                log.info("Nachricht zu %s fehlt – poste neu", termin["title"])

    kanal = raid_kanal()
    if not kanal:
        log.warning("Kanal %s nicht gefunden", RAID_KANAL)
        return
    nachricht = await kanal.send(embed=embed, view=ansicht)
    await db.aendern("events", {"discord_channel_id": str(kanal.id), "discord_message_id": str(nachricht.id)},
                     id=f"eq.{termin['id']}")
    termin["discord_channel_id"], termin["discord_message_id"] = str(kanal.id), str(nachricht.id)
    signaturen[termin["id"]] = sig


async def als_abgesagt_markieren(termin):
    if not (termin.get("discord_message_id") and termin.get("discord_channel_id")):
        return
    kanal = bot.get_channel(int(termin["discord_channel_id"]))
    if kanal:
        try:
            await kanal.get_partial_message(int(termin["discord_message_id"])).edit(
                embed=raid_embed(termin, [], abgesagt=True), view=None)
        except discord.NotFound:
            pass
    signaturen.pop(termin["id"], None)


# ============================== ANMELDEN ==============================

async def website_charaktere(discord_id):
    return await db.lesen("characters", discord_id=f"eq.{discord_id}", select="id,user_id,name,class,role,is_main")


def bester_charakter(charaktere, rolle=None):
    passend = [c for c in charaktere if rolle is None or c["role"] == rolle]
    return next((c for c in passend if c["is_main"]), passend[0] if passend else None)


async def vorhandene_anmeldung(eid, discord_id):
    return next((a for a in await anmeldungen_laden(eid) if a["discord_id"] == discord_id), None)


async def website_anmelden(eid, charakter, status, discord_id):
    await db.einfuegen("event_signups", {"event_id": eid, "user_id": charakter["user_id"],
                                         "character_id": charakter["id"], "status": status},
                       konflikt="event_id,user_id")
    # Doppelte Discord-only-Anmeldung derselben Person entfernen
    await db.loeschen("discord_event_signups", event_id=f"eq.{eid}", discord_id=f"eq.{discord_id}")


async def discord_anmelden(eid, member, rolle, klasse, status, charaktere):
    await db.einfuegen("discord_event_signups", {
        "event_id": eid, "discord_id": str(member.id), "display_name": member.display_name,
        "avatar_url": member.display_avatar.url, "class": klasse, "role": rolle, "status": status,
    }, konflikt="event_id,discord_id")
    # Falls die Person über einen Website-Charakter angemeldet war: diese Anmeldung entfernen
    for user_id in {c["user_id"] for c in charaktere}:
        await db.loeschen("event_signups", event_id=f"eq.{eid}", user_id=f"eq.{user_id}")


async def gespeicherte_klasse(discord_id):
    zeilen = await db.lesen("discord_profiles", discord_id=f"eq.{discord_id}", select="class")
    return zeilen[0]["class"] if zeilen else None


async def anmelden(interaction: discord.Interaction, eid: str, aktion: str, klasse: str | None = None):
    """Führt einen Klick auf einen Raid-Button aus. Antwortet immer ephemer."""
    termin = await termin_laden(eid)
    if not termin:
        return await interaction.followup.send("Diesen Termin gibt es nicht mehr.", ephemeral=True)
    if not anmeldung_offen(termin):
        return await interaction.followup.send("Die Anmeldung für diesen Termin ist geschlossen.", ephemeral=True)

    member, did = interaction.user, str(interaction.user.id)
    charaktere = await website_charaktere(did)
    bisher = await vorhandene_anmeldung(eid, did)

    if aktion in ROLLEN:
        charakter = bester_charakter(charaktere, aktion)
        if charakter:
            await website_anmelden(eid, charakter, "dabei", did)
            text = f"✅ Angemeldet als **{charakter['name']}** ({charakter['class']}, {ROLLEN[aktion][1]})."
        else:
            klasse = klasse or await gespeicherte_klasse(did)
            if not klasse:
                return await interaction.followup.send("Welche Klasse spielst du? (Nur beim ersten Mal)",
                                                       view=KlassenAuswahl(eid, aktion), ephemeral=True)
            await discord_anmelden(eid, member, aktion, klasse, "dabei", charaktere)
            text = f"✅ Angemeldet als **{ROLLEN[aktion][1]}** ({klasse})."
            if charaktere:
                text += f"\nHinweis: Auf der Website hast du keinen Charakter mit der Rolle {ROLLEN[aktion][1]}."

    elif aktion in ("vorlaeufig", "ab"):
        status = "vorlaeufig" if aktion == "vorlaeufig" else "abgemeldet"
        if bisher and bisher["source"] == "web" and charaktere:
            charakter = next((c for c in charaktere if c["id"] == bisher["character_id"]), None) \
                or bester_charakter(charaktere)
            await website_anmelden(eid, charakter, status, did)
        elif bisher:
            await discord_anmelden(eid, member, bisher.get("role"), bisher.get("class"), status, charaktere)
        elif bester_charakter(charaktere):
            await website_anmelden(eid, bester_charakter(charaktere), status, did)
        elif status == "abgemeldet":
            await discord_anmelden(eid, member, None, await gespeicherte_klasse(did), status, charaktere)
        else:
            return await interaction.followup.send("Klick zuerst auf deine Rolle (Tank, Heiler oder DD), "
                                                   "dann auf Vorläufig.", ephemeral=True)
        text = "❔ Du bist als **vorläufig** eingetragen." if status == "vorlaeufig" else "✖️ Du bist **abgemeldet**."

    else:  # Klasse ändern
        return await interaction.followup.send("Welche Klasse spielst du?", view=KlassenAuswahl(eid, None),
                                               ephemeral=True)

    await nachricht_aktualisieren(termin, erzwingen=True)
    await interaction.followup.send(text, ephemeral=True)


class RaidKnopf(discord.ui.DynamicItem[discord.ui.Button],
                template=r"raid:(?P<aktion>tank|heiler|dd|vorlaeufig|ab|klasse):(?P<eid>[0-9a-f-]{36})"):
    """Button an der Raid-Nachricht. Die Termin-ID steckt in der custom_id, daher bleiben die
    Buttons auch nach einem Neustart des Bots klickbar."""

    STIL = {
        "tank": ("Tank", "🛡️", discord.ButtonStyle.primary, 0),
        "heiler": ("Heiler", "💚", discord.ButtonStyle.success, 0),
        "dd": ("DD", "⚔️", discord.ButtonStyle.danger, 0),
        "vorlaeufig": ("Vorläufig", "❔", discord.ButtonStyle.secondary, 1),
        "ab": ("Abmelden", "✖️", discord.ButtonStyle.secondary, 1),
        "klasse": ("Klasse ändern", "🔄", discord.ButtonStyle.secondary, 1),
    }

    def __init__(self, aktion, eid):
        label, emoji, stil, reihe = self.STIL[aktion]
        super().__init__(discord.ui.Button(label=label, emoji=emoji, style=stil, row=reihe,
                                           custom_id=f"raid:{aktion}:{eid}"))
        self.aktion, self.eid = aktion, eid

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["aktion"], match["eid"])

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            await anmelden(interaction, self.eid, self.aktion)
        except Exception:
            log.exception("Anmeldung fehlgeschlagen")
            await interaction.followup.send("Das hat leider nicht geklappt – bitte versuch es gleich noch einmal.",
                                            ephemeral=True)


class KlassenAuswahl(discord.ui.View):
    """Ephemere Klassenwahl. Merkt sich die Klasse und führt danach die Anmeldung aus."""

    def __init__(self, eid, rolle):
        super().__init__(timeout=180)
        self.eid, self.rolle = eid, rolle
        auswahl = discord.ui.Select(placeholder="Klasse wählen",
                                    options=[discord.SelectOption(label=k) for k in KLASSEN])
        auswahl.callback = self.gewaehlt
        self.add_item(auswahl)

    async def gewaehlt(self, interaction: discord.Interaction):
        klasse = interaction.data["values"][0]
        await interaction.response.defer(ephemeral=True, thinking=True)
        await db.einfuegen("discord_profiles", {"discord_id": str(interaction.user.id), "class": klasse},
                           konflikt="discord_id")
        if self.rolle:
            await anmelden(interaction, self.eid, self.rolle, klasse)
            return
        # Nur Klasse geändert: eine bestehende Discord-Anmeldung übernimmt die neue Klasse
        bisher = await vorhandene_anmeldung(self.eid, str(interaction.user.id))
        if bisher and bisher["source"] == "discord":
            await db.aendern("discord_event_signups", {"class": klasse},
                             event_id=f"eq.{self.eid}", discord_id=f"eq.{interaction.user.id}")
            termin = await termin_laden(self.eid)
            if termin:
                await nachricht_aktualisieren(termin, erzwingen=True)
        hinweis = ("" if not bisher or bisher["source"] == "discord" else
                   "\nDu bist mit einem Website-Charakter angemeldet – dessen Klasse änderst du auf der Website.")
        await interaction.followup.send(f"🔄 Klasse gespeichert: **{klasse}**.{hinweis}", ephemeral=True)


# ============================== /raid-BEFEHLE ==============================

class RaidFormular(discord.ui.Modal, title="Neuer Raid"):
    titel = discord.ui.TextInput(label="Titel", placeholder="z. B. Raid-Abend", max_length=120)
    datum = discord.ui.TextInput(label="Beginn (TT.MM.JJJJ HH:MM)", placeholder="31.10.2026 20:00", max_length=16)
    instanz = discord.ui.TextInput(label="Instanz (optional)", required=False, max_length=120)
    plaetze = discord.ui.TextInput(label="Plätze", default=str(STANDARD_PLAETZE), max_length=2)
    beschreibung = discord.ui.TextInput(label="Beschreibung (optional)", style=discord.TextStyle.paragraph,
                                        required=False, max_length=1000)

    def __init__(self, wochen):
        super().__init__()
        self.wochen = wochen

    async def on_submit(self, interaction: discord.Interaction):
        try:
            lokal = datetime.strptime(self.datum.value.strip(), "%d.%m.%Y %H:%M")
        except ValueError:
            return await interaction.response.send_message(
                "Das Datum bitte so angeben: **31.10.2026 20:00**", ephemeral=True)
        try:
            plaetze = max(1, min(40, int(self.plaetze.value)))
        except ValueError:
            plaetze = STANDARD_PLAETZE
        await interaction.response.defer(ephemeral=True, thinking=True)

        serie = str(uuid.uuid4()) if self.wochen > 1 else None
        # Wiederholung in Ortszeit, damit die Uhrzeit über die Zeitumstellung hinweg gleich bleibt
        zeilen = [{
            "series_id": serie, "title": self.titel.value.strip(), "instance": self.instanz.value.strip() or None,
            "description": self.beschreibung.value.strip() or None, "max_size": plaetze,
            "starts_at": (lokal + timedelta(weeks=i)).replace(tzinfo=ZONE).astimezone(timezone.utc).isoformat(),
        } for i in range(self.wochen)]
        termine = await db.einfuegen("events", zeilen)
        for termin in termine:
            await nachricht_aktualisieren(termin, erzwingen=True)
        await interaction.followup.send(
            f"✅ {len(termine)} Termin(e) angelegt und in {raid_kanal().mention if raid_kanal() else RAID_KANAL} "
            "gepostet. Sie stehen auch auf der Website unter Termine & Raids.", ephemeral=True)


async def kommende_termine(interaction: discord.Interaction, eingabe: str):
    seit = (jetzt() - timedelta(hours=NACHLAUF_STUNDEN)).isoformat()
    termine = await db.lesen("events", select="id,title,starts_at", starts_at=f"gte.{seit}",
                             order="starts_at.asc", limit="25")
    auswahl = []
    for t in termine:
        name = f"{zeit(t['starts_at']).astimezone(ZONE):%d.%m. %H:%M} – {t['title']}"
        if eingabe.lower() in name.lower():
            auswahl.append(app_commands.Choice(name=name[:100], value=t["id"]))
    return auswahl


raid_befehle = app_commands.Group(name="raid", description="Raid-Termine und Anmeldungen", guild_only=True)


async def nur_raidleitung(interaction):
    if not ist_raidleitung(interaction.user):
        await interaction.response.send_message("Das dürfen nur Raidleiter, Offiziere und der Gildenmeister.",
                                                ephemeral=True)
        return False
    return True


@raid_befehle.command(name="neu", description="Neuen Raid-Termin anlegen und posten")
@app_commands.describe(wochen="Wöchentlich wiederholen: Anzahl Wochen inkl. diesem Termin (1 = einmalig)")
async def raid_neu(interaction: discord.Interaction, wochen: app_commands.Range[int, 1, 12] = 1):
    if await nur_raidleitung(interaction):
        await interaction.response.send_modal(RaidFormular(wochen))


@raid_befehle.command(name="fehlende", description="Raider auflisten, die sich noch nicht gemeldet haben")
@app_commands.describe(termin="Raid-Termin", erwaehnen="Fehlende im Raid-Kanal erwähnen")
@app_commands.autocomplete(termin=kommende_termine)
async def raid_fehlende(interaction: discord.Interaction, termin: str, erwaehnen: bool = False):
    if not await nur_raidleitung(interaction):
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    eintrag = await termin_laden(termin)
    rolle = discord.utils.get(interaction.guild.roles, name=RAIDER_ROLLE)
    if not eintrag or not rolle:
        return await interaction.followup.send("Termin oder Rolle „Raider“ nicht gefunden.", ephemeral=True)
    gemeldet = {a["discord_id"] for a in await anmeldungen_laden(termin)}
    fehlende = [m for m in rolle.members if not m.bot and str(m.id) not in gemeldet]
    if not fehlende:
        return await interaction.followup.send("🎉 Alle Raider haben sich gemeldet.", ephemeral=True)
    liste = ", ".join(m.mention for m in fehlende)
    if erwaehnen and raid_kanal():
        start = int(zeit(eintrag["starts_at"]).timestamp())
        await raid_kanal().send(f"📣 Noch keine Rückmeldung zu **{eintrag['title']}** (<t:{start}:F>): {liste}\n"
                                "Bitte meldet euch an der Raid-Nachricht an oder ab.",
                                allowed_mentions=discord.AllowedMentions(users=True))
    await interaction.followup.send(f"Noch nicht gemeldet ({len(fehlende)}): {liste}"
                                    + ("\n(Im Raid-Kanal erwähnt.)" if erwaehnen else ""),
                                    ephemeral=True, allowed_mentions=discord.AllowedMentions.none())


async def anmeldung_umschalten(interaction, termin, geschlossen):
    if not await nur_raidleitung(interaction):
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    await db.aendern("events", {"signups_closed": geschlossen}, id=f"eq.{termin}")
    eintrag = await termin_laden(termin)
    if eintrag:
        await nachricht_aktualisieren(eintrag, erzwingen=True)
    await interaction.followup.send("🔒 Anmeldung geschlossen." if geschlossen else "🔓 Anmeldung wieder offen.",
                                    ephemeral=True)


@raid_befehle.command(name="schliessen", description="Anmeldung zu einem Raid vorzeitig schließen")
@app_commands.autocomplete(termin=kommende_termine)
async def raid_schliessen(interaction: discord.Interaction, termin: str):
    await anmeldung_umschalten(interaction, termin, True)


@raid_befehle.command(name="oeffnen", description="Geschlossene Anmeldung wieder öffnen")
@app_commands.autocomplete(termin=kommende_termine)
async def raid_oeffnen(interaction: discord.Interaction, termin: str):
    await anmeldung_umschalten(interaction, termin, False)


@raid_befehle.command(name="absagen", description="Raid absagen (Termin und Anmeldungen werden gelöscht)")
@app_commands.autocomplete(termin=kommende_termine)
async def raid_absagen(interaction: discord.Interaction, termin: str):
    if not await nur_raidleitung(interaction):
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    eintrag = await termin_laden(termin)
    if not eintrag:
        return await interaction.followup.send("Diesen Termin gibt es nicht mehr.", ephemeral=True)
    await db.loeschen("events", id=f"eq.{termin}")
    await als_abgesagt_markieren(eintrag)
    await interaction.followup.send(f"❌ **{eintrag['title']}** wurde abgesagt.", ephemeral=True)


# ============================== ABGLEICH ==============================

# Termine, deren Nachricht der Bot verwaltet: id -> zuletzt bekannte Zeile (für "abgesagt",
# falls der Termin auf der Website gelöscht wird). Überlebt keinen Neustart – dann werden
# gelöschte Termine nicht mehr nachträglich als abgesagt markiert.
bekannte_termine: dict[str, dict] = {}


@tasks.loop(seconds=SYNC_SEKUNDEN)
async def abgleichen():
    try:
        seit = (jetzt() - timedelta(hours=NACHLAUF_STUNDEN)).isoformat()
        termine = await db.lesen("events", select="*", starts_at=f"gte.{seit}", order="starts_at.asc")
        aktuelle = {t["id"] for t in termine}

        for termin in termine:
            await nachricht_aktualisieren(termin)
            bekannte_termine[termin["id"]] = termin
            await erinnern(termin)

        # Auf der Website gelöschte Termine als abgesagt markieren
        for eid in [e for e in bekannte_termine if e not in aktuelle]:
            termin = bekannte_termine.pop(eid)
            if jetzt() < zeit(termin["starts_at"]) and not await termin_laden(eid):
                await als_abgesagt_markieren(termin)
    except Exception:
        log.exception("Raid-Abgleich fehlgeschlagen")


async def erinnern(termin):
    start = zeit(termin["starts_at"])
    if termin.get("reminder_sent") or not (timedelta(0) < start - jetzt() <= timedelta(minutes=ERINNERUNG_MINUTEN)):
        return
    kanal = bot.get_channel(int(termin["discord_channel_id"])) if termin.get("discord_channel_id") else None
    if not kanal:
        return
    ids = {a["discord_id"] for a in await anmeldungen_laden(termin["id"]) if a["status"] in ("dabei", "vorlaeufig")}
    if ids:
        await kanal.send(f"⏰ **{termin['title']}** startet <t:{int(start.timestamp())}:R>! "
                         + " ".join(f"<@{i}>" for i in ids),
                         reference=discord.MessageReference(message_id=int(termin["discord_message_id"]),
                                                            channel_id=kanal.id, fail_if_not_exists=False),
                         allowed_mentions=discord.AllowedMentions(users=True))
    await db.aendern("events", {"reminder_sent": True}, id=f"eq.{termin['id']}")


@abgleichen.before_loop
async def vor_dem_abgleich():
    await bot.wait_until_ready()


# ============================== EINBINDEN (aus bot.py) ==============================

def einrichten(client: discord.Client):
    """In setup_hook aufrufen: Buttons registrieren und /raid-Befehle anlegen."""
    global bot, db, ZONE, SITE_URL
    bot = client
    url, schluessel = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and schluessel):
        log.warning("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen – Raid-Anmeldung ist aus.")
        return
    db = Datenbank(url, schluessel)
    ZONE = ZoneInfo(os.environ.get("ZEITZONE", "Europe/Berlin"))
    SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
    client.add_dynamic_items(RaidKnopf)
    client.tree = app_commands.CommandTree(client)
    client.tree.add_command(raid_befehle)


async def starten(client: discord.Client):
    """In on_ready aufrufen: /raid-Befehle für den Server veröffentlichen und Abgleich starten."""
    if db is None or not client.guild:
        return
    # Nur auf diesem Server registrieren (erscheint sofort, nicht erst nach bis zu einer Stunde)
    client.tree.copy_global_to(guild=client.guild)
    await client.tree.sync(guild=client.guild)
    if not abgleichen.is_running():
        abgleichen.start()
