"""Kopfgeld-Brett im Kanal 💰│kopfgeld.

Marin hängt oben im Kanal einen Post mit dem Button "Kopfgeld aussetzen" aus. Wer klickt, füllt ein
Formular aus (Spieler, Klasse, Volk, letztes bekanntes Level, Summe). Daraus wird ein Steckbrief im
Kanal, mit einem Thread darunter für Sichtungen.

Wer den Gesuchten erledigt hat, klickt am Steckbrief auf "Erledigt melden" und lädt danach im Thread
einen Screenshot hoch. Marin hängt den Screenshot an den Steckbrief, markiert ihn als erledigt und
erinnert den Auftraggeber daran, das Gold zu schicken. Auftraggeber und Offiziere können ein Kopfgeld
auch zurückziehen.

Alles, was der Bot wissen muss, steht im Steckbrief selbst (Auftraggeber-ID in der custom_id der
Buttons), daher braucht das Modul keine Datenbank und die Buttons funktionieren auch nach einem Neustart.
"""
import asyncio
import io
import logging
import re
import time

import discord

KANAL = "💰│kopfgeld"
PANEL_TITEL = "💰 Kopfgeld aussetzen"
OFFIZIER_ROLLEN = ("Offizier", "Gildenmeister")
WARTEZEIT = 15 * 60          # so lange wartet Marin nach "Erledigt melden" auf den Screenshot
FARBE_OFFEN = 0xC0392B
FARBE_ERLEDIGT = 0x8BE04E
FARBE_ZURUECK = 0x607D8B
BILD_ENDUNGEN = (".png", ".jpg", ".jpeg", ".webp", ".gif")

log = logging.getLogger("gildenbot.kopfgeld")
bot: discord.Client | None = None
# Thread-ID -> (Nutzer-ID, Steckbrief-Nachricht-ID, Ablaufzeit): wer gerade einen Screenshot nachreichen soll
_offene_meldungen: dict[int, list[tuple[int, int, float]]] = {}


def ist_offizier(member):
    return member.guild_permissions.administrator or any(r.name in OFFIZIER_ROLLEN for r in member.roles)


def summe_lesbar(text):
    """'50' -> '50 Gold'; '1g 50s' bleibt wie es ist."""
    text = text.strip()
    return f"{text} Gold" if re.fullmatch(r"\d+([.,]\d+)?", text) else text


def panel_embed():
    return discord.Embed(
        title=PANEL_TITEL,
        description=(
            "Hat dich jemand gegankt oder geht dir ein Spieler der Allianz gewaltig auf die Nerven? "
            "Dann setz ein Kopfgeld auf ihn aus.\n\n"
            "**So läuft's:**\n"
            "**1.** Klick auf den Button und trag ein, wen du suchst und wie viel Gold du zahlst.\n"
            "**2.** Ich hänge den Steckbrief hier aus. Im Thread darunter könnt ihr Sichtungen posten.\n"
            "**3.** Wer ihn erwischt, klickt am Steckbrief auf **Erledigt melden** und lädt im Thread "
            "einen Screenshot vom Kill hoch – am besten so, dass man sieht, wo es war.\n"
            "**4.** Der Auftraggeber schickt dem Jäger das Gold per Post.\n\n"
            "Wer ein Kopfgeld aussetzt, zahlt es auch. In Gadgetzan nennt man das Geschäftsehre.\n"
            "— *Marin Noggenfogger*"
        ),
        color=FARBE_OFFEN,
    )


# ============================== FORMULAR ==============================

class KopfgeldFormular(discord.ui.Modal, title="Kopfgeld aussetzen"):
    name = discord.ui.TextInput(label="Auf wen? (Charaktername)", max_length=40)
    klasse = discord.ui.TextInput(label="Klasse", placeholder="z. B. Schurke", max_length=30)
    volk = discord.ui.TextInput(label="Volk", placeholder="z. B. Nachtelf", max_length=30)
    level = discord.ui.TextInput(label="Letztes bekanntes Level", placeholder="z. B. 27", max_length=10)
    summe = discord.ui.TextInput(label="Kopfgeld (Gold)", placeholder="z. B. 5", max_length=30)

    async def on_submit(self, interaction: discord.Interaction):
        kanal = interaction.channel
        auftraggeber = interaction.user
        ziel = self.name.value.strip()
        embed = discord.Embed(
            title=f"🎯 GESUCHT: {ziel}",
            description=f"**{self.volk.value.strip()}**, **{self.klasse.value.strip()}**, "
                        f"zuletzt Level **{self.level.value.strip()}**",
            color=FARBE_OFFEN, timestamp=discord.utils.utcnow())
        embed.add_field(name="💰 Kopfgeld", value=summe_lesbar(self.summe.value), inline=True)
        embed.add_field(name="Ausgesetzt von", value=auftraggeber.mention, inline=True)
        embed.add_field(name="Status", value="🔴 Offen", inline=True)
        embed.set_footer(text="Sichtungen bitte in den Thread · Kill melden über den Button")
        await interaction.response.send_message(f"Dein Steckbrief für **{ziel}** hängt aus.", ephemeral=True)
        nachricht = await kanal.send(embed=embed, view=steckbrief_ansicht(auftraggeber.id))
        try:
            await nachricht.create_thread(name=f"🎯 {ziel}"[:100], auto_archive_duration=10080)
        except discord.HTTPException:
            log.exception("Thread für Kopfgeld %s nicht angelegt", ziel)


# ============================== BUTTONS ==============================

class PanelAnsicht(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Kopfgeld aussetzen", emoji="💰", style=discord.ButtonStyle.danger,
                       custom_id="kopfgeld:aussetzen")
    async def aussetzen(self, interaction: discord.Interaction, _button):
        await interaction.response.send_modal(KopfgeldFormular())


class SteckbriefKnopf(discord.ui.DynamicItem[discord.ui.Button],
                      template=r"kopfgeld:(?P<aktion>erledigt|zurueck):(?P<auftraggeber>\d+)"):
    """Buttons am Steckbrief; die ID des Auftraggebers steckt in der custom_id."""

    STIL = {
        "erledigt": ("Erledigt melden", "☠️", discord.ButtonStyle.success),
        "zurueck": ("Zurückziehen", "✖️", discord.ButtonStyle.secondary),
    }

    def __init__(self, aktion, auftraggeber):
        label, emoji, stil = self.STIL[aktion]
        super().__init__(discord.ui.Button(label=label, emoji=emoji, style=stil,
                                           custom_id=f"kopfgeld:{aktion}:{auftraggeber}"))
        self.aktion, self.auftraggeber = aktion, int(auftraggeber)

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["aktion"], match["auftraggeber"])

    async def callback(self, interaction: discord.Interaction):
        if self.aktion == "zurueck":
            await zurueckziehen(interaction, self.auftraggeber)
        else:
            await erledigt_melden(interaction)


def steckbrief_ansicht(auftraggeber_id):
    ansicht = discord.ui.View(timeout=None)
    ansicht.add_item(SteckbriefKnopf("erledigt", auftraggeber_id))
    ansicht.add_item(SteckbriefKnopf("zurueck", auftraggeber_id))
    return ansicht


def status_setzen(embed: discord.Embed, status, farbe):
    for i, feld in enumerate(embed.fields):
        if feld.name == "Status":
            embed.set_field_at(i, name="Status", value=status, inline=True)
    embed.color = farbe
    return embed


async def zurueckziehen(interaction: discord.Interaction, auftraggeber_id):
    if interaction.user.id != auftraggeber_id and not ist_offizier(interaction.user):
        await interaction.response.send_message("Nur wer das Kopfgeld ausgesetzt hat (oder ein Offizier) kann es "
                                                "zurückziehen.", ephemeral=True)
        return
    embed = interaction.message.embeds[0]
    embed.title = embed.title.replace("🎯 GESUCHT:", "✖️ ZURÜCKGEZOGEN:")
    status_setzen(embed, f"✖️ Zurückgezogen von {interaction.user.mention}", FARBE_ZURUECK)
    embed.set_footer(text="Dieses Kopfgeld gilt nicht mehr")
    await interaction.response.edit_message(embed=embed, view=None)
    await thread_schliessen(interaction.message)


async def erledigt_melden(interaction: discord.Interaction):
    thread = interaction.message.thread or interaction.guild.get_thread(interaction.message.id)
    if thread is None:
        thread = await interaction.message.create_thread(name=interaction.message.embeds[0].title[:100],
                                                         auto_archive_duration=10080)
    elif thread.archived:
        await thread.edit(archived=False)
    jetzt = time.time()
    liste = [m for m in _offene_meldungen.get(thread.id, []) if m[2] > jetzt and m[0] != interaction.user.id]
    liste.append((interaction.user.id, interaction.message.id, jetzt + WARTEZEIT))
    _offene_meldungen[thread.id] = liste
    await interaction.response.send_message(
        f"Stark! Lade jetzt bitte in {thread.mention} einen Screenshot vom Kill hoch "
        f"(innerhalb von {WARTEZEIT // 60} Minuten). Dann trage ich das Kopfgeld als erledigt ein.",
        ephemeral=True)


async def thread_schliessen(steckbrief: discord.Message):
    thread = steckbrief.thread or steckbrief.guild.get_thread(steckbrief.id)
    if thread:
        try:
            await thread.edit(archived=True, locked=True)
        except discord.HTTPException:
            pass


# ============================== SCREENSHOT IM THREAD ==============================

async def on_message(nachricht: discord.Message):
    if nachricht.author.bot or not isinstance(nachricht.channel, discord.Thread):
        return
    meldungen = _offene_meldungen.get(nachricht.channel.id)
    if not meldungen:
        return
    jetzt = time.time()
    treffer = next((m for m in meldungen if m[0] == nachricht.author.id and m[2] > jetzt), None)
    bild = next((a for a in nachricht.attachments
                 if (a.content_type or "").startswith("image/") or a.filename.lower().endswith(BILD_ENDUNGEN)), None)
    if not treffer or not bild:
        return
    _offene_meldungen.pop(nachricht.channel.id, None)

    kanal = nachricht.channel.parent
    try:
        steckbrief = await kanal.fetch_message(treffer[1])
    except discord.NotFound:
        return
    embed = steckbrief.embeds[0]
    if not embed.title.startswith("🎯"):
        return  # schon erledigt oder zurückgezogen
    jaeger = nachricht.author
    datei = discord.File(io.BytesIO(await bild.read()), filename="beweis" + bild.filename[bild.filename.rfind("."):])
    embed.title = embed.title.replace("🎯 GESUCHT:", "☠️ ERLEDIGT:")
    status_setzen(embed, f"☠️ Erledigt von {jaeger.mention}", FARBE_ERLEDIGT)
    embed.set_image(url=f"attachment://{datei.filename}")
    embed.set_footer(text="Kopfgeld eingelöst")
    await steckbrief.edit(embed=embed, attachments=[datei], view=None)

    auftraggeber = next((f.value for f in embed.fields if f.name == "Ausgesetzt von"), "")
    summe = next((f.value for f in embed.fields if f.name == "💰 Kopfgeld"), "das Kopfgeld")
    ziel = embed.title.split(":", 1)[-1].strip()
    await nachricht.channel.send(
        f"☠️ **{ziel}** liegt im Staub – sauber, {jaeger.mention}!\n"
        f"{auftraggeber}, schick {jaeger.display_name} bitte **{summe}** per Post.",
        allowed_mentions=discord.AllowedMentions(users=True))
    await asyncio.sleep(2)
    await thread_schliessen(steckbrief)


# ============================== EINBINDEN (aus bot.py) ==============================

async def panel_sicherstellen():
    kanal = discord.utils.get(bot.guild.text_channels, name=KANAL)
    if not kanal:
        log.warning("Kanal %s nicht gefunden – Kopfgeld-Brett ist aus.", KANAL)
        return
    embed = panel_embed()
    async for nachricht in kanal.history(limit=None, oldest_first=True):
        if nachricht.author == bot.user and nachricht.embeds and nachricht.embeds[0].title == PANEL_TITEL:
            alt = nachricht.embeds[0]
            if alt.description != embed.description or alt.color != embed.color:
                await nachricht.edit(embed=embed, view=PanelAnsicht())
            return
    await kanal.send(embed=embed, view=PanelAnsicht())


def einrichten(client: discord.Client):
    """In setup_hook aufrufen: Buttons registrieren und auf Screenshots hören."""
    global bot
    bot = client
    import ereignisse
    client.add_view(PanelAnsicht())
    client.add_dynamic_items(SteckbriefKnopf)
    ereignisse.anmelden(client, "on_message", on_message)


async def starten(client: discord.Client):
    """In on_ready aufrufen: Marins Post im Kanal anlegen bzw. auffrischen."""
    if client.guild:
        await panel_sicherstellen()
