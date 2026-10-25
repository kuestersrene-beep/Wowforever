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

## Voraussetzungen im Discord Developer Portal

Unter **Bot** → *Privileged Gateway Intents* einschalten:
- **Message Content Intent** (für das Ticket-Protokoll)
- **Server Members Intent** (für `/raid fehlende`)

## Auf dem Server starten

```bash
cd wowforever
git pull
cat > discord-setup/.env << 'EOF'
DISCORD_TOKEN=dein-bot-token
# Für die Raid-Anmeldung (dieselben Werte wie in der .env der Website):
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=dein-service-role-key
# Optional: Link zur Website in der Raid-Nachricht
SITE_URL=https://deine-id.duckdns.org
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

**Für alle** – an der Raid-Nachricht in `📅│raid-ankündigungen`:

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
