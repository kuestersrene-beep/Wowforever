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

## Voraussetzungen im Discord Developer Portal

Unter **Bot** → *Privileged Gateway Intents* den **Message Content Intent** einschalten
(für das Ticket-Protokoll).

## Auf dem Server starten

```bash
cd wowforever
git pull
cat > discord-setup/.env << 'EOF'
DISCORD_TOKEN=dein-bot-token
EOF
docker compose up -d --build discord-bot
docker compose logs -f discord-bot
```

Die bereits geposteten Blueposts merkt sich der Bot in `discord-setup/data/`.
Es darf immer nur **eine** Instanz des Bots laufen.
