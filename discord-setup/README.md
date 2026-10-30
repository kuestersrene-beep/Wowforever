# Discord-Server der Gilde

Zwei Teile:

- **`server_einrichten.py`** – einmalig bzw. bei Änderungen ausführen. Legt Rollen, Kategorien,
  Kanäle, Berechtigungen und Infotexte an und gleicht vorhandene ab.
  `python server_einrichten.py --probelauf` zeigt vorher, was passieren würde.
- **`bot.py`** – läuft dauerhaft als Docker-Container (`discord-bot` in `docker-compose.yml`):
  - postet offizielle Blizzard-Blueposts zu WoW Forever (DE + US) alle 10 Minuten in `📰│patchnotes`
  - Bewerbungs-Tickets: Button in `📨│bewerbung-starten` → Formular → privater Kanal in `📨 TICKETS`.
    Offiziere können dort per Button als Trial aufnehmen oder schließen; beim Schließen
    landet ein Protokoll in `📂│bewerbungen-intern`.
  - Raid-Anmeldung (`raid.py`) gemeinsam mit der Gilden-Website, siehe unten.
  - Protokoll (`modlog.py`) in `🧾│mod-log`, siehe unten.
  - Rollen-Sync mit der Website (`rollensync.py`), siehe unten.
  - Willkommens-Nachricht per DM bis zum Release (`willkommen.py`), siehe unten.

## Voraussetzungen im Discord Developer Portal

Unter **Bot** → *Privileged Gateway Intents* einschalten:
- **Message Content Intent** (für das Ticket-Protokoll)
- **Server Members Intent** (für `/raid fehlende` und das Protokoll: Beitritte, Rollen)

Damit das Protokoll auch zeigt, **wer** etwas geändert hat, braucht die Bot-Rolle auf dem Server das
Recht **Audit-Log anzeigen** (Servereinstellungen → Rollen → Rolle des Bots).

## Auf dem Server starten

```bash
cd wowforever
git pull
cat > discord-setup/.env << 'EOF'
DISCORD_TOKEN=dein-bot-token
# Für die Raid-Anmeldung (dieselben Werte wie in der .env der Website):
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=dein-service-role-key
# Optional: Link zur Website in der Raid-Nachricht und der Willkommens-Nachricht
SITE_URL=https://deine-id.duckdns.org
# Optional: Bis zu diesem Tag bekommen neue Mitglieder die Willkommens-DM (Standard 2026-11-05)
RELEASE_DATUM=2026-11-05
# Optional: Zielkanal für die Fraktions-Entscheidung (Kanal-ID, Rechtsklick auf den Kanal ->
# "ID kopieren" - braucht den Entwicklermodus unter Discord-Einstellungen -> Erweitert).
# Ohne diese Angabe wird standardmäßig in 🌐│gilden-app gepostet.
FRAKTION_KANAL_ID=1563978707381653504
EOF
docker compose up -d --build discord-bot
docker compose logs -f discord-bot
```

Die bereits geposteten Blueposts merkt sich der Bot in `discord-setup/data/`.
Es darf immer nur **eine** Instanz des Bots laufen.

## Raid-Anmeldung (`raid.py`)

Ein Raid ist auf der Website (**Termine & Raids**) und im Discord **derselbe Termin** mit denselben
Anmeldungen. Voraussetzung: `supabase/schema.sql` ist eingespielt und `SUPABASE_URL` sowie
`SUPABASE_SERVICE_ROLE_KEY` stehen in `discord-setup/.env`. Fehlen sie, läuft der Bot ohne Raid-Teil.

**Für alle** – an der Raid-Nachricht in `🗓️│raid-planung`:

| Button | Wirkung |
|---|---|
| 🛡️ Tank · 💚 Heiler · ⚔️ DD | Anmelden bzw. Rolle wechseln. Wer auf der Website einen Charakter mit dieser Rolle hat, wird mit ihm angemeldet (Main bevorzugt); alle anderen wählen beim ersten Mal ihre Klasse. |
| ❔ Vorläufig | Bestehende Anmeldung auf „vorläufig“ setzen |
| ✖️ Abmelden | Absagen – geht auch ohne vorherige Anmeldung |
| 🔄 Klasse ändern | Die im Discord gespeicherte Klasse ändern |

Die Nachricht zeigt Tanks, Heiler und DDs mit Klasse, ✅ bestätigt / 🪑 Bank (aus der Aufstellung auf der
Website), Vorläufige, Abgemeldete und „12/20 dabei“. Zur Startzeit schließt die Anmeldung automatisch,
60 Minuten vorher erinnert der Bot alle Angemeldeten.

**Für Raidleiter, Offiziere und Gildenmeister:**

| Befehl | Wirkung |
|---|---|
| `/raid neu [wochen]` | Formular für einen neuen Raid (Titel, Beginn `TT.MM.JJJJ HH:MM`, Instanz, Plätze, Beschreibung); `wochen` legt eine wöchentliche Serie an |
| `/raid fehlende <termin> [erwaehnen]` | Alle mit der Rolle *Raider*, die sich noch nicht gemeldet haben; auf Wunsch im Raid-Kanal erwähnt |
| `/raid schliessen <termin>` / `/raid oeffnen <termin>` | Anmeldung vorzeitig schließen bzw. wieder öffnen |
| `/raid absagen <termin>` | Termin löschen; die Nachricht wird als abgesagt markiert |

Auf der Website angelegte Termine postet der Bot innerhalb einer Minute automatisch; Änderungen auf der
Website (Anmeldungen, Aufstellung, Bearbeiten, Löschen) erscheinen ebenso schnell im Discord.

## Klassen- und Rollenkanäle

`server_einrichten.py` legt die Kategorie **🧙 KLASSEN & ROLLEN** an: einen Kanal pro Klasse
(`🪓│krieger`, `🔨│paladin`, …) sowie `🛡️│tanks` und `💚│heiler`. Jeder Kanal ist **nur mit der
passenden Rolle** sichtbar (Klassenrolle bzw. `🛡️ Tank` / `💚 Heiler`). Wer keine dieser Rollen hat,
sieht die Kategorie gar nicht. Ausnahme: Rollen mit Administratorrecht (Gildenmeister) sehen alles.

Die Rolle **Class-Leader** (unter Raidleiter) sieht zusätzlich `🎓│class-leader` im Bereich
🛡️ OFFIZIERE – die übrigen Offizierskanäle bleiben für sie unsichtbar.

## Fraktions-Entscheidung (`fraktion.py`)

Läuft alle 60 Sekunden (teilt sich die Datenbank-Verbindung mit `raid.py`, braucht also
dieselben `SUPABASE_*`-Werte). Postet, welche Fraktion auf der Website (Startseite →
Fraktionen) zur Wahl steht, in den Kanal aus `FRAKTION_KANAL_ID` (z. B. ein öffentlicher
Ankündigungskanal) – ohne diese Angabe standardmäßig in `🌐│gilden-app`. Die Nachricht wird bei
jeder Änderung **bearbeitet**, nicht neu gepostet:

- Solange noch niemand auf „Aufheben" geklickt hat: beide Entwürfe mit Name, Tagline und
  Kurzbeschreibung.
- Sobald ein Admin eine Fraktion aktiviert: 🏆-Embed mit Name, Tagline, Kurzbeschreibung und
  Wappen als Vorschaubild, verlinkt auf die Website.

Welcher Kanal/welche Nachricht das ist, steht in `site_settings` (`faction_discord_channel_id`/
`faction_discord_message_id`), genau wie bei den Raidterminen.

## Protokoll (`modlog.py`)

Der Bot schreibt in `🧾│mod-log`:

| Ereignis | Inhalt |
|---|---|
| 📥 Beigetreten / 📤 Verlassen / 👢 Rauswurf | Mitglied, Alter des Discord-Kontos (⚠️ bei unter 7 Tagen), letzte Rollen |
| 🔨 Gebannt / ♻️ Entbannt | Mitglied, durch wen |
| 🎭 Rollen geändert | erhaltene und entfernte Rollen, durch wen |
| ✏️ Spitzname / ⏳ Timeout | vorher/nachher bzw. Dauer, durch wen |
| 🗑️ Nachricht gelöscht / 📝 bearbeitet | Kanal, Inhalt (vorher/nachher), Anhänge – nur Nachrichten, die der Bot seit seinem Start gesehen hat; Bot-Nachrichten werden ignoriert |
| 📁 Kanal / 🏷️ Rolle angelegt, gelöscht, umbenannt | Name, geänderte Rechte, durch wen |

## Rollen-Sync mit der Website (`rollensync.py`)

Läuft alle 2 Minuten (braucht wie die Raid-Anmeldung `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`).

**Website → Discord:** Wer auf der Website Charaktere eingetragen hat, bekommt im Discord automatisch
die passenden **Klassenrollen** und **🛡️ Tank / 💚 Heiler / ⚔️ Schaden** – von Main und Twinks. Wer
(noch) keinen Charakter hat, bekommt die 1. Klassenwahl und die Rolle aus der Umfrage. Dadurch öffnen
sich die Kanäle in 🧙 KLASSEN & ROLLEN von selbst. Für diese Mitglieder ist die Website maßgeblich:
Klassen- oder Spielrollen, die dort nicht stehen, nimmt der Bot wieder weg. Mitglieder ohne jede
Angabe auf der Website werden nicht angefasst.

**Discord → Website:** Die Rang-Rollen (Gildenmeister, Offizier, Raidleiter, Class-Leader, Raider,
Mitglied, Trial, Gast) landen in der Tabelle `discord_members`. Wer **Offizier** oder
**Gildenmeister** ist, ist damit automatisch Admin auf der Website.

## Willkommens-Nachricht (`willkommen.py`)

Bis zum Release (`RELEASE_DATUM`, Standard **2026-11-05**) schickt der Bot jedem neuen Mitglied eine
**Direktnachricht**: Begrüßung, Countdown bis zum Start, Link zur Website mit der Bitte, **Berufe und
Verfügbarkeit** einzutragen, und die gerade **laufenden Kurzabstimmungen** der Website. Ab dem
Release-Tag ist Schluss.

Neue Mitglieder haben noch keine Rolle. Die Nachricht verlinkt deshalb **nur Kanäle, die ohne Rolle
sichtbar sind** – `👋│willkommen` (aktuelle Infos), `📜│regeln`, `📋│bewerbung-info` und
`📨│bewerbung-starten`. Der Bot prüft das vor jedem Link; Kanäle, die eine Rolle brauchen, nennt er nur
als Text. Aktuelle Infos für Neue gehören also in `👋│willkommen`.

- `/willkommen` schickt dir die Nachricht zur Vorschau selbst – jederzeit.
- Als Status zeigt der Bot einen Countdown („⚔️ Noch 10 Tage bis WoW Forever“), am Release-Tag
  „🎉 WoW Forever ist live!“ und danach „Spielt WoW Forever“.
- Hat jemand Direktnachrichten von Server-Mitgliedern abgeschaltet, steht ein Hinweis im `🧾│mod-log`.

