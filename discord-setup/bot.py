"""Gilden-Bot für den Discord-Server.

- Postet offizielle Blizzard-Blueposts zu WoW Forever (DE + US) in den Patchnotes-Kanal.
- Bewerbungen als Tickets: Button -> Formular -> privater Kanal für Bewerber und Offiziere,
  beim Schließen landet ein Protokoll in bewerbungen-intern.
- Raid-Anmeldung gemeinsam mit der Gilden-Website (siehe raid.py).
- Fraktions-Entscheidung von der Website live in #gilden-app (siehe fraktion.py).
- Protokoll aller Änderungen im Kanal mod-log (siehe modlog.py).
- Klassen-/Spielrollen von der Website setzen, Ränge an die Website melden (siehe rollensync.py).
- Willkommens-Nachricht per DM an neue Mitglieder bis zum Release (siehe willkommen.py).
- Hinweis-Liste im Mod-Log, wer die Umfrage ausgefüllt hat, aber noch nicht im Server ist
  (siehe einladung.py).

Läuft dauerhaft (siehe docker-compose.yml). DISCORD_TOKEN und optional GUILD_ID kommen aus .env.
Im Developer Portal muss der "Message Content Intent" an sein (für das Protokoll).
"""
import asyncio
import html
import io
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path

import aiohttp
import discord
from discord.ext import tasks

import einladung
import fraktion
import modlog
import raid
import rollensync
import willkommen

# Kanal- und Rollennamen wie in server_einrichten.py
PATCHNOTES_KANAL = "📰│patchnotes"
START_KANAL = "📨│bewerbung-starten"
INTERN_KANAL = "📂│bewerbungen-intern"
TICKET_KATEGORIE = "📨 TICKETS"
OFFIZIER_ROLLEN = ("Offizier", "Gildenmeister")
TRIAL_ROLLE = "Trial"

# Blue-Tracker der Blizzard-Foren; übernommen wird, was in den Forever-Kategorien steht
# oder "Forever" im Titel hat.
QUELLEN = [
    {"name": "Blizzard-Forum (DE)", "flagge": "🇩🇪", "basis": "https://eu.forums.blizzard.com/de/wow",
     "kategorien": {"255", "256", "257"}},
    {"name": "Blizzard-Forum (US)", "flagge": "🇺🇸", "basis": "https://us.forums.blizzard.com/en/wow",
     "kategorien": {"346", "347", "348", "349"}},
]
INTERVALL_MINUTEN = 10
ERSTSTART_POSTS = 3       # so viele aktuelle Posts beim allerersten Start, damit der Kanal nicht leer ist
BLIZZARD_BLAU = 0x00AEFF
AKZENTFARBE = 0xC9A227

HIER = Path(__file__).resolve().parent
DATEN = Path(os.environ.get("DATEN_ORDNER", HIER / "data"))
GESEHEN_DATEI = DATEN / "gesehene_blueposts.json"

log = logging.getLogger("gildenbot")


def env_laden():
    datei = HIER / ".env"
    if datei.exists():
        for zeile in datei.read_text(encoding="utf-8").splitlines():
            if "=" in zeile and not zeile.strip().startswith("#"):
                key, _, val = zeile.partition("=")
                if val.strip():
                    os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


intents = discord.Intents.default()
intents.message_content = True
intents.members = True  # für /raid fehlende (Server Members Intent im Developer Portal)


class GildenBot(discord.Client):
    guild: discord.Guild | None = None

    async def setup_hook(self):
        # Buttons bleiben auch nach einem Neustart klickbar
        self.add_view(StartAnsicht())
        self.add_view(TicketAnsicht())
        raid.einrichten(self)
        fraktion.einrichten(self)
        modlog.einrichten(self)
        willkommen.einrichten(self)
        einladung.einrichten(self)

    async def on_ready(self):
        gid = os.environ.get("GUILD_ID")
        self.guild = self.get_guild(int(gid)) if gid else (self.guilds[0] if len(self.guilds) == 1 else None)
        if not self.guild:
            log.error("Server nicht eindeutig – bitte GUILD_ID in .env setzen.")
            return
        log.info("Eingeloggt als %s auf %s", self.user, self.guild.name)
        await panel_sicherstellen()
        if not blueposts_pruefen.is_running():
            blueposts_pruefen.start()
        await raid.starten(self)
        await fraktion.starten(self)
        await rollensync.starten(self)
        await willkommen.starten(self)
        await einladung.starten(self)


bot = GildenBot(intents=intents)


def text_kanal(name):
    return discord.utils.get(bot.guild.text_channels, name=name)


def ist_offizier(member):
    return member.guild_permissions.administrator or any(r.name in OFFIZIER_ROLLEN for r in member.roles)


# ============================== BLUEPOSTS ==============================

async def blueposts_holen(session, quelle):
    url = quelle["basis"] + "/groups/blizzard-tracker/posts.json"
    async with session.get(url, headers={"User-Agent": "Gildenbot (Discord)"},
                           timeout=aiohttp.ClientTimeout(total=30)) as antwort:
        antwort.raise_for_status()
        daten = await antwort.json()
    return [p for p in daten.get("posts", [])
            if str(p.get("category_id")) in quelle["kategorien"] or "forever" in p.get("topic_title", "").lower()]


def bluepost_embed(quelle, post):
    link = quelle["basis"] + post["url"]
    titel = html.unescape(post["topic_title"])
    if int(post.get("post_number", 1)) > 1:
        titel += " (Update)"
    auszug = html.unescape(re.sub(r"<[^>]+>", "", post.get("excerpt", ""))).strip()
    embed = discord.Embed(
        title=f"{quelle['flagge']} {titel}"[:256], url=link, color=BLIZZARD_BLAU,
        description=f"{auszug[:700]} …\n\n[**Weiterlesen im Forum**]({link})",
        timestamp=datetime.fromisoformat(post["created_at"].replace("Z", "+00:00")),
    )
    embed.set_author(name=f"{post.get('username', 'Blizzard')} · {post.get('user_title') or 'Blizzard'}")
    embed.set_footer(text=quelle["name"])
    return embed


@tasks.loop(minutes=INTERVALL_MINUTEN)
async def blueposts_pruefen():
    kanal = text_kanal(PATCHNOTES_KANAL)
    if not kanal:
        log.warning("Kanal %s nicht gefunden", PATCHNOTES_KANAL)
        return
    erster_start = not GESEHEN_DATEI.exists()
    gesehen = [] if erster_start else json.loads(GESEHEN_DATEI.read_text(encoding="utf-8"))
    gesehen_set = set(gesehen)

    neue = []
    async with aiohttp.ClientSession() as session:
        for quelle in QUELLEN:
            try:
                posts = await blueposts_holen(session, quelle)
            except Exception as fehler:  # Forum kurz nicht erreichbar: beim nächsten Durchlauf erneut
                log.warning("%s nicht abrufbar: %s", quelle["name"], fehler)
                continue
            for post in posts:
                # Blizzard postet manche Ankündigungen doppelt – daher auch nach Titel abgleichen
                schluessel = [f"{quelle['name']}:{post['id']}",
                              f"{quelle['name']}:{post['topic_title']}:{post.get('post_number')}"]
                if any(s in gesehen_set for s in schluessel):
                    continue
                gesehen_set.update(schluessel)
                gesehen.extend(schluessel)
                neue.append((quelle, post))

    neue.sort(key=lambda qp: qp[1]["created_at"])
    if erster_start:
        schon_gepostet = [m async for m in kanal.history(limit=20) if m.author == bot.user]
        neue = [] if schon_gepostet else neue[-ERSTSTART_POSTS:]
    for quelle, post in neue:
        await kanal.send(embed=bluepost_embed(quelle, post))

    DATEN.mkdir(parents=True, exist_ok=True)
    GESEHEN_DATEI.write_text(json.dumps(gesehen[-3000:]), encoding="utf-8")


@blueposts_pruefen.before_loop
async def vor_dem_ersten_durchlauf():
    await bot.wait_until_ready()


# ============================== BEWERBUNGS-TICKETS ==============================

def offenes_ticket(user_id):
    kategorie = discord.utils.get(bot.guild.categories, name=TICKET_KATEGORIE)
    if not kategorie:
        return None
    return next((k for k in kategorie.text_channels if f"ID {user_id}" in (k.topic or "")), None)


def bewerber_id(kanal):
    treffer = re.search(r"ID (\d+)", kanal.topic or "")
    return int(treffer.group(1)) if treffer else None


async def panel_sicherstellen():
    kanal = text_kanal(START_KANAL)
    if not kanal:
        log.warning("Kanal %s nicht gefunden", START_KANAL)
        return
    async for nachricht in kanal.history(limit=20):
        if nachricht.author == bot.user and nachricht.components:
            return
    embed = discord.Embed(
        title="📝 Bewerbung starten",
        description=(
            f"Du möchtest Teil von **{bot.guild.name}** werden? Klick auf den Button unten.\n\n"
            "**So läuft's ab:**\n"
            "**1.** Du füllst ein kurzes Formular aus.\n"
            "**2.** Es entsteht ein privater Kanal, den nur du und unsere Offiziere sehen.\n"
            "**3.** Dort meldet sich ein Offizier bei dir – gerne auch für ein kurzes Gespräch im Sprachkanal.\n\n"
            "Deine Bewerbung ist für andere Mitglieder nicht sichtbar."
        ),
        color=AKZENTFARBE,
    )
    await kanal.send(embed=embed, view=StartAnsicht())


class StartAnsicht(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Bewerbung starten", emoji="📝", style=discord.ButtonStyle.success,
                       custom_id="bewerbung:start")
    async def starten(self, interaction: discord.Interaction, _button):
        offen = offenes_ticket(interaction.user.id)
        if offen:
            await interaction.response.send_message(f"Du hast bereits eine offene Bewerbung: {offen.mention}",
                                                    ephemeral=True)
            return
        await interaction.response.send_modal(BewerbungsFormular())


class BewerbungsFormular(discord.ui.Modal, title="Bewerbung"):
    charakter = discord.ui.TextInput(label="Charaktername & Klasse / Skillung", max_length=100)
    rolle = discord.ui.TextInput(label="Rolle (Tank / Heiler / Schaden)", max_length=50)
    erfahrung = discord.ui.TextInput(label="Spielerfahrung", style=discord.TextStyle.paragraph, max_length=1000)
    zeit = discord.ui.TextInput(label="Wann hast du Zeit? (Tage / Uhrzeiten)", max_length=200)
    ueber_dich = discord.ui.TextInput(label="Über dich & wie hast du uns gefunden?",
                                      style=discord.TextStyle.paragraph, max_length=1000)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        guild, user = interaction.guild, interaction.user
        kategorie = discord.utils.get(guild.categories, name=TICKET_KATEGORIE)
        if not kategorie:
            await interaction.followup.send("Das Ticketsystem ist gerade nicht eingerichtet. Bitte schreib einem "
                                            "Offizier direkt.", ephemeral=True)
            return

        lesen_schreiben = discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True,
                                                      attach_files=True, embed_links=True)
        rechte = {guild.default_role: discord.PermissionOverwrite(view_channel=False), user: lesen_schreiben,
                  guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True,
                                                        read_message_history=True)}
        offiziere = [r for r in guild.roles if r.name in OFFIZIER_ROLLEN]
        for rolle in offiziere:
            rechte[rolle] = lesen_schreiben

        name = re.sub(r"[^a-z0-9äöüß]+", "-", user.display_name.lower()).strip("-") or "bewerber"
        kanal = await guild.create_text_channel(f"bewerbung-{name}"[:90], category=kategorie, overwrites=rechte,
                                                topic=f"Bewerbung von {user} · ID {user.id}")

        embed = discord.Embed(title=f"📝 Bewerbung von {user.display_name}", color=AKZENTFARBE,
                              timestamp=discord.utils.utcnow())
        embed.set_thumbnail(url=user.display_avatar.url)
        for feld in (self.charakter, self.rolle, self.erfahrung, self.zeit, self.ueber_dich):
            embed.add_field(name=feld.label, value=feld.value or "–", inline=False)
        offizier_rolle = next((r for r in offiziere if r.name == "Offizier"), None)
        await kanal.send(content=f"{user.mention} {offizier_rolle.mention if offizier_rolle else ''}", embed=embed,
                         view=TicketAnsicht(), allowed_mentions=discord.AllowedMentions(users=True, roles=True))
        await kanal.send("Danke für deine Bewerbung! 🙌 Ein Offizier meldet sich hier bei dir. Du kannst in diesem "
                         "Kanal jederzeit Fragen stellen oder Screenshots anhängen.")

        intern = text_kanal(INTERN_KANAL)
        if intern:
            await intern.send(f"📨 Neue Bewerbung von {user.mention}: {kanal.mention}")
        await interaction.followup.send(f"Deine Bewerbung ist eingegangen: {kanal.mention}", ephemeral=True)


class TicketAnsicht(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Als Trial aufnehmen", emoji="✅", style=discord.ButtonStyle.success,
                       custom_id="ticket:annehmen")
    async def annehmen(self, interaction: discord.Interaction, _button):
        if not ist_offizier(interaction.user):
            await interaction.response.send_message("Das dürfen nur Offiziere.", ephemeral=True)
            return
        uid = bewerber_id(interaction.channel)
        trial = discord.utils.get(interaction.guild.roles, name=TRIAL_ROLLE)
        try:
            mitglied = await interaction.guild.fetch_member(uid)
        except (discord.NotFound, TypeError):
            await interaction.response.send_message("Der Bewerber ist nicht mehr auf dem Server.", ephemeral=True)
            return
        await mitglied.add_roles(trial, reason=f"Bewerbung angenommen von {interaction.user}")
        await interaction.response.send_message(
            f"🎉 Willkommen in der Gilde, {mitglied.mention}! Du bist jetzt {trial.mention} – "
            "der Rest des Servers ist für dich freigeschaltet.")
        intern = text_kanal(INTERN_KANAL)
        if intern:
            await intern.send(f"✅ {mitglied.mention} wurde von {interaction.user.mention} als Trial aufgenommen.")

    @discord.ui.button(label="Schließen", emoji="🔒", style=discord.ButtonStyle.secondary, custom_id="ticket:schliessen")
    async def schliessen(self, interaction: discord.Interaction, _button):
        kanal = interaction.channel
        if not ist_offizier(interaction.user) and interaction.user.id != bewerber_id(kanal):
            await interaction.response.send_message("Das dürfen nur Offiziere oder der Bewerber.", ephemeral=True)
            return
        await interaction.response.send_message("🔒 Das Ticket wird geschlossen und in 10 Sekunden gelöscht.")

        zeilen = []
        async for m in kanal.history(limit=None, oldest_first=True):
            zeit = m.created_at.astimezone().strftime("%d.%m.%Y %H:%M")
            text = m.content
            for e in m.embeds:
                text += "".join(f"\n  {f.name}: {f.value}" for f in e.fields)
            text += "".join(f"\n  [Anhang] {a.url}" for a in m.attachments)
            zeilen.append(f"[{zeit}] {m.author.display_name}: {text}")
        datei = discord.File(io.BytesIO("\n".join(zeilen).encode("utf-8")), filename=f"{kanal.name}.txt")

        intern = text_kanal(INTERN_KANAL)
        if intern:
            await intern.send(f"🔒 Ticket **{kanal.name}** geschlossen von {interaction.user.mention}. Protokoll:",
                              file=datei)
        await asyncio.sleep(10)
        await kanal.delete(reason=f"Ticket geschlossen von {interaction.user}")


if __name__ == "__main__":
    env_laden()
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        raise SystemExit("DISCORD_TOKEN fehlt (.env).")
    bot.run(token, root_logger=True)  # auch die eigenen Meldungen (gildenbot) ausgeben
