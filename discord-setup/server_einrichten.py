"""Richtet den Gilden-Discord ein: Rollen, Kategorien, Kanäle, Berechtigungen, Infotexte.

Aufruf:
    python server_einrichten.py --probelauf      zeigt nur an, was passieren würde
    python server_einrichten.py                  legt alles an
    python server_einrichten.py --aufraeumen     löscht zusätzlich Kanäle, die nicht in der Struktur stehen

Das Skript ist wiederholbar: Vorhandene Rollen/Kanäle mit gleichem Namen werden übersprungen.
Token und optional GUILD_ID stehen in der Datei .env neben diesem Skript.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ============================== KONFIGURATION ==============================

GILDENNAME = ""          # leer lassen = Servername bleibt wie er ist
AKZENTFARBE = 0xC9A227   # Farbe der Info-Boxen (Gold)

# Berechtigungs-Bits laut Discord-API
P = {
    "INVITE": 1 << 0, "KICK": 1 << 1, "BAN": 1 << 2, "ADMIN": 1 << 3, "MANAGE_CHANNELS": 1 << 4,
    "REACT": 1 << 6, "AUDIT_LOG": 1 << 7, "PRIORITY_SPEAKER": 1 << 8, "STREAM": 1 << 9,
    "VIEW": 1 << 10, "SEND": 1 << 11, "MANAGE_MESSAGES": 1 << 13, "EMBED": 1 << 14,
    "ATTACH": 1 << 15, "HISTORY": 1 << 16, "MENTION_EVERYONE": 1 << 17, "EXT_EMOJI": 1 << 18,
    "CONNECT": 1 << 20, "SPEAK": 1 << 21, "MUTE": 1 << 22, "DEAFEN": 1 << 23, "MOVE": 1 << 24,
    "VAD": 1 << 25, "CHANGE_NICK": 1 << 26, "MANAGE_NICKS": 1 << 27, "APP_COMMANDS": 1 << 31,
    "MANAGE_EVENTS": 1 << 33, "MANAGE_THREADS": 1 << 34, "PUBLIC_THREADS": 1 << 35,
    "PRIVATE_THREADS": 1 << 36, "EXT_STICKERS": 1 << 37, "THREAD_SEND": 1 << 38,
    "ACTIVITIES": 1 << 39, "TIMEOUT": 1 << 40, "SOUNDBOARD": 1 << 42, "CREATE_EVENTS": 1 << 44,
    "VOICE_MSG": 1 << 46, "POLLS": 1 << 49,
}


def perms(*namen):
    wert = 0
    for n in namen:
        wert |= P[n]
    return wert


# Grundrechte für @everyone (keine Einladungen, kein @everyone-Ping)
BASIS = perms("VIEW", "SEND", "HISTORY", "REACT", "EMBED", "ATTACH", "EXT_EMOJI", "EXT_STICKERS",
              "CONNECT", "SPEAK", "VAD", "STREAM", "APP_COMMANDS", "PUBLIC_THREADS", "THREAD_SEND",
              "CHANGE_NICK", "ACTIVITIES", "SOUNDBOARD", "VOICE_MSG", "POLLS")

# Rollen von oben (höchste) nach unten
ROLLEN = [
    {"name": "Gildenmeister", "farbe": 0xE6B33C, "anzeigen": True, "rechte": perms("ADMIN")},
    {"name": "Offizier", "farbe": 0xC0392B, "anzeigen": True,
     "rechte": perms("KICK", "BAN", "MANAGE_MESSAGES", "MANAGE_NICKS", "MOVE", "MUTE", "DEAFEN",
                     "MANAGE_THREADS", "TIMEOUT", "AUDIT_LOG", "MANAGE_EVENTS", "CREATE_EVENTS",
                     "MENTION_EVERYONE", "PRIORITY_SPEAKER", "INVITE", "PRIVATE_THREADS")},
    {"name": "Raidleiter", "farbe": 0xE67E22, "anzeigen": True,
     "rechte": perms("MOVE", "MUTE", "PRIORITY_SPEAKER", "MENTION_EVERYONE", "CREATE_EVENTS",
                     "MANAGE_EVENTS", "INVITE")},
    {"name": "Class-Leader", "farbe": 0x1ABC9C, "anzeigen": True, "rechte": perms("INVITE")},
    {"name": "Raider", "farbe": 0x3498DB, "anzeigen": True, "rechte": perms("INVITE")},
    {"name": "Mitglied", "farbe": 0x2ECC71, "anzeigen": True, "rechte": perms("INVITE")},
    {"name": "Trial", "farbe": 0x95A5A6, "anzeigen": True, "rechte": 0},
    {"name": "Gast", "farbe": 0x607D8B, "anzeigen": True, "rechte": 0},
    # Spielrollen
    {"name": "🛡️ Tank", "farbe": 0, "anzeigen": False, "rechte": 0},
    {"name": "💚 Heiler", "farbe": 0, "anzeigen": False, "rechte": 0},
    {"name": "⚔️ Schaden", "farbe": 0, "anzeigen": False, "rechte": 0},
    # Klassen, Farben wie CLASS_COLORS in der Web-App
    {"name": "Krieger", "farbe": 0xC79C6E, "anzeigen": False, "rechte": 0},
    {"name": "Paladin", "farbe": 0xF58CBA, "anzeigen": False, "rechte": 0},
    {"name": "Jäger", "farbe": 0xABD473, "anzeigen": False, "rechte": 0},
    {"name": "Schurke", "farbe": 0xFFF569, "anzeigen": False, "rechte": 0},
    {"name": "Priester", "farbe": 0xF0EBE0, "anzeigen": False, "rechte": 0},
    {"name": "Schamane", "farbe": 0x2459FF, "anzeigen": False, "rechte": 0},
    {"name": "Magier", "farbe": 0x69CCF0, "anzeigen": False, "rechte": 0},
    {"name": "Hexenmeister", "farbe": 0x9482C9, "anzeigen": False, "rechte": 0},
    {"name": "Druide", "farbe": 0xFF7D0A, "anzeigen": False, "rechte": 0},
]

# Wer darf was sehen / schreiben
GRUPPEN = {
    "alle": None,
    "gast": ["Gast", "Trial", "Mitglied", "Raider", "Raidleiter", "Offizier", "Gildenmeister"],
    "mitglied": ["Trial", "Mitglied", "Raider", "Raidleiter", "Offizier", "Gildenmeister"],
    "raid": ["Raidleiter", "Offizier", "Gildenmeister"],
    "offizier": ["Offizier", "Gildenmeister"],
    # Class-Leader sehen ihren Kanal im Offiziersbereich, sonst nichts davon
    "classleader": ["Class-Leader", "Offizier", "Gildenmeister"],
    # Spielrollen-Kanäle: nur mit der jeweiligen Rolle sichtbar
    "tank": ["🛡️ Tank"],
    "heiler": ["💚 Heiler"],
}

# Ein Kanal pro Klasse, nur mit der gleichnamigen Klassenrolle sichtbar (Rollen siehe ROLLEN)
KLASSEN_KANAELE = [
    ("Krieger", "🪓│krieger"), ("Paladin", "🔨│paladin"), ("Jäger", "🏹│jäger"),
    ("Schurke", "🗡️│schurke"), ("Priester", "✨│priester"), ("Schamane", "⚡│schamane"),
    ("Magier", "🔮│magier"), ("Hexenmeister", "😈│hexenmeister"), ("Druide", "🐻│druide"),
]
for _klasse, _ in KLASSEN_KANAELE:
    GRUPPEN[_klasse] = [_klasse]

# sicht = wer die Kategorie sieht; schreiben = nur diese Gruppe darf schreiben (sonst alle Sichtbaren)
STRUKTUR = [
    # Neue Leute ohne Rolle sehen nur willkommen, regeln und die Bewerbung, alles andere erst ab Gast
    {"name": "📜 INFORMATION", "sicht": "gast", "schreiben": "offizier", "kanaele": [
        {"name": "👋│willkommen", "thema": "Herzlich willkommen! Lies dich hier kurz ein.", "text": "willkommen", "sicht": "alle"},
        {"name": "📜│regeln", "thema": "Die Regeln unserer Gemeinschaft – bitte lesen.", "text": "regeln", "sicht": "alle"},
        {"name": "📢│ankündigungen", "thema": "Wichtige Neuigkeiten der Gildenleitung."},
        {"name": "🎭│rollen", "thema": "Ränge und Rollen im Überblick.", "text": "rollen"},
        {"name": "📰│patchnotes", "thema": "Updates und Änderungen am Spiel."},
    ]},
    {"name": "📝 BEWERBUNG", "sicht": "alle", "kanaele": [
        {"name": "📋│bewerbung-info", "thema": "So bewirbst du dich bei uns.", "schreiben": "offizier", "text": "bewerbung"},
        {"name": "📨│bewerbung-starten", "thema": "Klick auf den Button, um deine Bewerbung zu starten.", "schreiben": "offizier"},
        {"name": "🎙️ Bewerbungsgespräch", "typ": "voice"},
    ]},
    {"name": "💬 COMMUNITY", "sicht": "gast", "kanaele": [
        {"name": "💬│allgemein", "thema": "Quatschen über alles rund um die Gilde."},
        {"name": "🎲│offtopic", "thema": "Alles, was nichts mit WoW zu tun hat."},
        {"name": "📸│screenshots", "thema": "Eure besten Momente in Azeroth."},
        {"name": "😂│memes", "thema": "Humor erwünscht – im Rahmen der Regeln."},
        {"name": "🔗│links-und-guides", "thema": "Nützliche Seiten, Addons und Guides."},
    ]},
    {"name": "⚔️ GILDE", "sicht": "mitglied", "kanaele": [
        {"name": "📌│gilden-infos", "thema": "Feste Infos: Raidzeiten, Bank, Ansprechpartner.", "schreiben": "offizier"},
        {"name": "🌐│gilden-app", "thema": "Automatische Posts aus unserer Gilden-App: Umfragen, Termine, Aufstellungen, Fraktionsentscheidung.", "schreiben": "offizier"},
        {"name": "📅│raid-ankündigungen", "thema": "Wichtige Infos der Raidleitung.", "schreiben": "raid"},
        {"name": "🗓️│raid-planung", "thema": "Raidtermine mit Anmeldung per Button und Absprachen rund um Raids."},
        {"name": "🤝│gruppensuche", "thema": "Mitspieler für Dungeons, Quests und mehr finden."},
    ]},
    {"name": "🩸 PVP", "sicht": "mitglied", "kanaele": [
        {"name": "⚔️│pvp-treffpunkt", "thema": "Schlachtfelder, World-PvP und Angriffe auf feindliche Städte."},
        {"name": "🚨│hilferufe", "thema": "Wirst du gegankt? Ort posten – wer kann, kommt helfen!"},
        {"name": "⚔️ Schlachtfeld 1", "typ": "voice"},
        {"name": "⚔️ Schlachtfeld 2", "typ": "voice"},
        {"name": "🔥 World-PvP", "typ": "voice"},
    ]},
    {"name": "🐉 RAID", "sicht": "mitglied", "kanaele": [
        {"name": "🐉 Raid 1", "typ": "voice"},
        {"name": "🐉 Raid 2", "typ": "voice"},
        {"name": "🎤 Raidleitung", "typ": "voice", "sicht": "raid"},
    ]},
    # Jeder Kanal ist nur mit der passenden Rolle sichtbar; die Kategorie selbst sehen Mitglieder,
    # Discord blendet sie aber aus, solange man keinen der Kanäle darin sehen kann.
    {"name": "🧙 KLASSEN & ROLLEN", "sicht": "mitglied", "kanaele": [
        {"name": "🛡️│tanks", "thema": "Austausch unter Tanks: Ausrüstung, Taktiken, Absprachen.", "sicht": "tank"},
        {"name": "💚│heiler", "thema": "Austausch unter Heilern: Ausrüstung, Heilzuteilung, Absprachen.",
         "sicht": "heiler"},
    ] + [
        {"name": kanal, "thema": f"Alles rund um die Klasse {klasse}: Skillung, Rotation, Ausrüstung.",
         "sicht": klasse}
        for klasse, kanal in KLASSEN_KANAELE
    ]},
    {"name": "🔊 SPRACHKANÄLE", "sicht": "gast", "kanaele": [
        {"name": "🍺 Taverne", "typ": "voice"},
        {"name": "🎮 Zocken", "typ": "voice"},
        {"name": "🗡️ Dungeon 1", "typ": "voice", "limit": 5},
        {"name": "🗡️ Dungeon 2", "typ": "voice", "limit": 5},
        {"name": "🗡️ Dungeon 3", "typ": "voice", "limit": 5},
        {"name": "💤 AFK", "typ": "voice", "afk": True},
    ]},
    {"name": "🛡️ OFFIZIERE", "sicht": "offizier", "kanaele": [
        {"name": "🛡️│offiziers-chat", "thema": "Interne Absprachen der Gildenleitung."},
        {"name": "📂│bewerbungen-intern", "thema": "Besprechung eingegangener Bewerbungen."},
        {"name": "📈│raid-auswertung", "thema": "Logs, Teilnahme, Verbesserungen."},
        {"name": "🎓│class-leader", "thema": "Absprachen der Class-Leader mit der Gildenleitung.",
         "sicht": "classleader"},
        {"name": "🧾│mod-log", "thema": "Automatisches Protokoll des Bots: Beitritte, Rollen, Änderungen."},
        {"name": "🛡️ Offiziersrat", "typ": "voice"},
    ]},
    # Hier legt bot.py die privaten Bewerbungskanäle an; deren Kanäle räumt dieses Skript nie auf
    {"name": "📨 TICKETS", "sicht": "offizier", "dynamisch": True, "kanaele": []},
]

# ============================== INFOTEXTE ==============================


def infotexte(gilde, k, r):
    """k = Kanal-ID nach Kanalname, r = Rollen-ID nach Rollenname."""
    def kanal(name):
        return f"<#{k[name]}>" if name in k else f"#{name}"

    def rolle(name):
        return f"<@&{r[name]}>" if name in r else f"@{name}"

    return {
        "willkommen": {
            "title": f"⚔️ Willkommen bei {gilde}!",
            "description": (
                "Schön, dass du da bist! Wir sind eine Gemeinschaft von Freunden, die in **World of Warcraft Forever** "
                "gemeinsam Azeroth erobern – mit Spaß, Zusammenhalt und gemeinsamen Zielen.\n\n"
                "**So geht's los:**\n"
                f"**1.** Lies dir die {kanal('📜│regeln')} durch.\n"
                f"**2.** Ein {rolle('Offizier')} gibt dir in Kürze deine Rolle – dann öffnet sich der Rest des Servers.\n\n"
                f"Du kennst uns noch nicht und möchtest mitspielen? Alles zur Bewerbung findest du in {kanal('📋│bewerbung-info')}.\n"
                "Dauert es zu lange? Schreib einfach einem Offizier eine Direktnachricht."
            ),
        },
        "regeln": {
            "title": "📜 Unsere Regeln",
            "description": (
                "**1. Respekt** – Wir gehen freundlich miteinander um. Beleidigungen, Rassismus, Sexismus und "
                "Hetze haben hier keinen Platz.\n\n"
                "**2. Kein Spam & keine Werbung** – Keine Fremdwerbung, kein Flooding, keine Kettenbriefe.\n\n"
                "**3. Passende Kanäle** – Bitte nutze die Kanäle für ihr jeweiliges Thema.\n\n"
                "**4. Kein NSFW** – Anstößige oder verstörende Inhalte sind verboten.\n\n"
                "**5. Verbindlichkeit** – Raid-Anmeldungen sind verbindlich. Wenn du absagen musst, sag rechtzeitig Bescheid.\n\n"
                f"**6. Loot** – Es gelten die Loot-Regeln der Gildenleitung (siehe {kanal('📌│gilden-infos')}). "
                "Loot-Diskussionen gehören nicht in den Raid.\n\n"
                f"**7. Leitung** – Anweisungen von {rolle('Offizier')} und {rolle('Raidleiter')} sind zu folgen. "
                "Kritik gerne sachlich per Direktnachricht.\n\n"
                "**8. Interna bleiben intern** – Gildeninterne Informationen werden nicht nach außen getragen.\n\n"
                "Es gelten außerdem die Discord-Richtlinien und die Regeln des Spiels. "
                "Verstöße können zu Verwarnung, Timeout oder Ausschluss führen."
            ),
        },
        "rollen": {
            "title": "🎭 Ränge & Rollen",
            "description": (
                f"{rolle('Gildenmeister')} – Leitung der Gilde\n"
                f"{rolle('Offizier')} – Organisation, Bewerbungen und Moderation\n"
                f"{rolle('Raidleiter')} – Planung und Leitung der Raids\n"
                f"{rolle('Class-Leader')} – Ansprechpartner für eine Klasse\n"
                f"{rolle('Raider')} – Fester Bestandteil des Raidkaders\n"
                f"{rolle('Mitglied')} – Vollwertiges Gildenmitglied\n"
                f"{rolle('Trial')} – Probemitglied in der Kennenlernphase\n"
                f"{rolle('Gast')} – Freunde und Besucher der Gilde\n\n"
                "**Spielrolle & Klasse**\n"
                "Teile einem Offizier deine Klasse und Rolle (Tank, Heiler, Schaden) mit – "
                "du bekommst dann die passenden Rollen. So sehen alle auf einen Blick, wer was spielt.\n"
                "Mit deiner Klassenrolle (und als Tank oder Heiler) öffnet sich der passende Kanal "
                f"in **🧙 KLASSEN & ROLLEN**, z. B. {kanal('🪓│krieger')} oder {kanal('🛡️│tanks')}."
            ),
        },
        "bewerbung": {
            "title": "📋 Bewerbung",
            "description": (
                f"Du möchtest Teil von **{gilde}** werden? Klick in {kanal('📨│bewerbung-starten')} auf "
                "**Bewerbung starten** und füll das kurze Formular aus. Wir fragen nach:\n\n"
                "• Charaktername, Klasse und Skillung\n"
                "• Rolle (Tank / Heiler / Schaden)\n"
                "• Spielerfahrung\n"
                "• Wann du Zeit hast\n"
                "• Ein paar Worte über dich\n\n"
                "Danach bekommst du einen **privaten Kanal**, den nur du und unsere Offiziere sehen. "
                "Gerne auch zu einem kurzen Gespräch in **🎙️ Bewerbungsgespräch**. "
                f"Nach der Aufnahme startest du als {rolle('Trial')}."
            ),
        },
    }

# ============================== TECHNIK ==============================

API = "https://discord.com/api/v10"
HIER = Path(__file__).resolve().parent
PROBELAUF = "--probelauf" in sys.argv
AUFRAEUMEN = "--aufraeumen" in sys.argv
TOKEN = ""
_fake_id = 0


def env_lesen():
    werte = {}
    datei = HIER / ".env"
    if not datei.exists():
        sys.exit("Datei .env fehlt.")
    for zeile in datei.read_text(encoding="utf-8").splitlines():
        if "=" in zeile and not zeile.strip().startswith("#"):
            key, _, val = zeile.partition("=")
            werte[key.strip()] = val.strip().strip('"').strip("'")
    return werte


def api(methode, pfad, daten=None, optional=False):
    """optional=True: bei einem Discord-Fehler nur warnen und None zurückgeben statt abzubrechen."""
    global _fake_id
    if PROBELAUF and methode != "GET":
        _fake_id += 1
        return {"id": f"neu{_fake_id}"}
    body = json.dumps(daten).encode() if daten is not None else None
    req = urllib.request.Request(API + pfad, data=body, method=methode, headers={
        "Authorization": f"Bot {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (gilden-setup, 1.0)",
        "X-Audit-Log-Reason": "Gilden-Einrichtung",
    })
    for _ in range(6):
        try:
            with urllib.request.urlopen(req) as antwort:
                text = antwort.read()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            inhalt = e.read().decode(errors="replace")
            if e.code == 429:
                time.sleep(json.loads(inhalt).get("retry_after", 1) + 0.2)
                continue
            if e.code == 401:
                sys.exit("Token ungültig. Bitte in .env prüfen (ggf. im Developer Portal neu erzeugen).")
            if optional:
                print(f"  ! Discord-Fehler {e.code} bei {methode} {pfad} – übersprungen")
                return None
            sys.exit(f"Discord-Fehler {e.code} bei {methode} {pfad}:\n{inhalt}")
    sys.exit(f"Zu viele Rate-Limits bei {methode} {pfad}")


def overwrites(guild_id, rollen_ids, sicht, schreiben):
    ow = {guild_id: [0, 0]}  # id -> [allow, deny]

    def setze(rid, allow=0, deny=0):
        eintrag = ow.setdefault(rid, [0, 0])
        eintrag[0] |= allow
        eintrag[1] |= deny

    if GRUPPEN[sicht]:
        setze(guild_id, deny=P["VIEW"])
        for name in GRUPPEN[sicht]:
            setze(rollen_ids[name], allow=P["VIEW"])
    if schreiben:
        schreib_bits = perms("SEND", "PUBLIC_THREADS", "PRIVATE_THREADS", "THREAD_SEND")
        setze(guild_id, deny=schreib_bits)
        for name in GRUPPEN[schreiben]:
            setze(rollen_ids[name], allow=schreib_bits)
    return [{"id": rid, "type": 0, "allow": str(a), "deny": str(d)} for rid, (a, d) in ow.items()]


def rechte_abgleichen(kanal, soll, einzug):
    """Setzt die Berechtigungen eines vorhandenen Kanals, falls sie von der Struktur abweichen."""
    def norm(liste):
        return {(o["id"], int(o["allow"]), int(o["deny"])) for o in liste
                if int(o["allow"]) or int(o["deny"])}

    if norm(kanal.get("permission_overwrites", [])) == norm(soll):
        print(f"{einzug}= {kanal['name']} (existiert)")
        return
    api("PATCH", f"/channels/{kanal['id']}", {"permission_overwrites": soll})
    print(f"{einzug}~ {kanal['name']} (Sichtbarkeit/Rechte angepasst)")


def rollen_sortieren(gid, rollen_ids):
    """Bringt die Rollen in die Reihenfolge von ROLLEN (oberste zuerst).

    Discord legt jede neue Rolle ganz unten an (direkt über @everyone). Deshalb stellt das Skript die
    Reihenfolge danach ausdrücklich her. Rollen, die nicht in ROLLEN stehen (z. B. die Bot-Rolle),
    bleiben, wo sie sind; unsere Rollen bekommen die Positionen direkt über @everyone.
    """
    if PROBELAUF and any(str(i).startswith("neu") for i in rollen_ids.values()):
        print("  ~ Reihenfolge wird nach dem Anlegen geprüft")
        return
    aktuell = {r["id"]: r["position"] for r in api("GET", f"/guilds/{gid}/roles")}
    eigene = [rollen_ids[r["name"]] for r in ROLLEN]                # oben -> unten
    ist = sorted(eigene, key=lambda rid: -aktuell.get(rid, 0))
    if ist == eigene:
        print("  = Reihenfolge (stimmt)")
        return
    soll = [{"id": rid, "position": len(eigene) - i} for i, rid in enumerate(eigene)]
    if PROBELAUF:
        print("  ~ Reihenfolge würde korrigiert: " + " > ".join(r["name"] for r in ROLLEN[:8]) + " > …")
        return
    if api("PATCH", f"/guilds/{gid}/roles", soll, optional=True) is not None:
        print("  ↕ Reihenfolge korrigiert: " + " > ".join(r["name"] for r in ROLLEN[:8]) + " > …")
    else:
        print("  ! Reihenfolge konnte nicht gesetzt werden – die Bot-Rolle muss ganz oben stehen")


def main():
    global TOKEN
    env = env_lesen()
    TOKEN = env.get("DISCORD_TOKEN", "")
    if not TOKEN:
        sys.exit("In .env fehlt DISCORD_TOKEN.")

    guilds = api("GET", "/users/@me/guilds")
    if env.get("GUILD_ID"):
        guild = next((g for g in guilds if g["id"] == env["GUILD_ID"]), None)
        if not guild:
            sys.exit("Der Bot ist nicht auf dem Server mit dieser GUILD_ID.")
    elif len(guilds) == 1:
        guild = guilds[0]
    else:
        sys.exit(f"Der Bot ist auf {len(guilds)} Servern. Bitte GUILD_ID in .env eintragen.")
    gid = guild["id"]
    gilde = GILDENNAME or guild["name"]
    print(f"{'PROBELAUF – es wird nichts geändert' if PROBELAUF else 'Einrichtung'} für Server: {guild['name']}\n")

    # Rollen: von unten nach oben anlegen, damit die oberste zuletzt (= ganz oben) landet
    vorhandene_rollen = {r["name"]: r["id"] for r in api("GET", f"/guilds/{gid}/roles")}
    rollen_ids = {}
    print("Rollen:")
    for rolle in reversed(ROLLEN):
        if rolle["name"] in vorhandene_rollen:
            rollen_ids[rolle["name"]] = vorhandene_rollen[rolle["name"]]
            print(f"  = {rolle['name']} (existiert)")
            continue
        neu = api("POST", f"/guilds/{gid}/roles", {
            "name": rolle["name"], "color": rolle["farbe"], "hoist": rolle["anzeigen"],
            "mentionable": rolle["anzeigen"], "permissions": str(rolle["rechte"]),
        })
        rollen_ids[rolle["name"]] = neu["id"]
        print(f"  + {rolle['name']}")
    rollen_sortieren(gid, rollen_ids)
    print("  ~ @everyone: Grundrechte angepasst (keine Einladungen, kein @everyone-Ping)")
    api("PATCH", f"/guilds/{gid}/roles/{gid}", {"permissions": str(BASIS)})

    # Kanäle
    vorhanden = api("GET", f"/guilds/{gid}/channels")
    kanal_ids, neue_kanaele, afk_id, behalten = {}, set(), None, set()
    print("\nKanäle:")
    for kat in STRUKTUR:
        kat_ow = overwrites(gid, rollen_ids, kat["sicht"], kat.get("schreiben"))
        treffer = next((c for c in vorhanden if c["type"] == 4 and c["name"] == kat["name"]), None)
        if treffer:
            kat_id = treffer["id"]
            rechte_abgleichen(treffer, kat_ow, "  ")
        else:
            kat_id = api("POST", f"/guilds/{gid}/channels",
                         {"name": kat["name"], "type": 4, "permission_overwrites": kat_ow})["id"]
            print(f"  + {kat['name']}")
        behalten.add(kat_id)
        if kat.get("dynamisch"):
            behalten.update(c["id"] for c in vorhanden if c.get("parent_id") == kat_id)

        for k in kat["kanaele"]:
            voice = k.get("typ") == "voice"
            treffer = next((c for c in vorhanden if c.get("parent_id") == kat_id and c["name"] == k["name"]), None)
            k_ow = overwrites(gid, rollen_ids, k.get("sicht", kat["sicht"]), k.get("schreiben", kat.get("schreiben")))
            if treffer:
                cid = treffer["id"]
                rechte_abgleichen(treffer, k_ow, "      ")
            else:
                daten = {"name": k["name"], "type": 2 if voice else 0, "parent_id": kat_id,
                         "permission_overwrites": k_ow}
                if voice:
                    daten["user_limit"] = k.get("limit", 0)
                else:
                    daten["topic"] = k.get("thema", "")
                    daten["rate_limit_per_user"] = k.get("slowmode", 0)
                cid = api("POST", f"/guilds/{gid}/channels", daten)["id"]
                neue_kanaele.add(k["name"])
                print(f"      + {'🔊' if voice else '#'} {k['name']}")
            kanal_ids[k["name"]] = cid
            behalten.add(cid)
            if k.get("afk"):
                afk_id = cid

    # Alte Kanäle (z. B. Discord-Standardkanäle)
    alte = [c for c in vorhanden if c["id"] not in behalten]
    if alte:
        print("\nKanäle, die nicht zur Struktur gehören:")
        for c in alte:
            if AUFRAEUMEN:
                api("DELETE", f"/channels/{c['id']}")
                print(f"  - {c['name']} (gelöscht)")
            else:
                print(f"  ? {c['name']} (bleibt; mit --aufraeumen löschen)")

    # Server-Einstellungen
    einstellungen = {
        "verification_level": 1,            # E-Mail muss bestätigt sein
        "default_message_notifications": 1,  # nur Erwähnungen
        "explicit_content_filter": 2,        # Medien aller Mitglieder prüfen
        "afk_timeout": 900,
        "system_channel_id": kanal_ids["👋│willkommen"],
    }
    if afk_id:
        einstellungen["afk_channel_id"] = afk_id
    if GILDENNAME:
        einstellungen["name"] = GILDENNAME
    api("PATCH", f"/guilds/{gid}", einstellungen)
    print("\nServer-Einstellungen: Verifizierung, Benachrichtigungen, Inhaltsfilter, AFK-Kanal gesetzt.")

    # Infotexte posten bzw. die eigene, bereits gepostete Nachricht aktualisieren
    texte = infotexte(gilde, kanal_ids, rollen_ids)
    bot_id = api("GET", "/users/@me")["id"]
    print("\nInfotexte:")
    for kat in STRUKTUR:
        for k in kat["kanaele"]:
            if not k.get("text"):
                continue
            cid = kanal_ids[k["name"]]
            embed = dict(texte[k["text"]], color=AKZENTFARBE)
            alt = None
            if k["name"] not in neue_kanaele:
                alt = next((m for m in api("GET", f"/channels/{cid}/messages?limit=50")
                            if m["author"]["id"] == bot_id and m.get("embeds")), None)
            if alt is None:
                api("POST", f"/channels/{cid}/messages", {"embeds": [embed]})
            elif all(alt["embeds"][0].get(f) == embed[f] for f in ("title", "description", "color")):
                print(f"  = {k['name']} (unverändert)")
                continue
            else:
                api("PATCH", f"/channels/{cid}/messages/{alt['id']}", {"embeds": [embed]})
                print(f"  ✎ {k['name']} (aktualisiert)")
                continue
                print(f"  ✉ {k['name']}")

    print("\nFertig." if not PROBELAUF else "\nProbelauf beendet – nichts wurde geändert.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
