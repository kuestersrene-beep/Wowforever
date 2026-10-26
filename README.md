# WoW Forever Umfrage

Kleine, schlanke Web-App für eine Umfrage unter Freunden zu "World of
Warcraft Forever". Login per Discord, ein Fragebogen pro Person, ein
Admin-Dashboard mit Auswertung.

**Tech-Stack:** Next.js (App Router, TypeScript) + Tailwind CSS + Supabase
(Auth & Datenbank) + Recharts. Läuft als Docker-Container auf deinem
eigenen Server.

---

## 0. Überblick, was du gleich tust

1. Supabase-Projekt anlegen, SQL-Schema einspielen
2. Discord-App anlegen, mit Supabase verbinden
3. Deine eigene Discord-ID herausfinden und als Admin eintragen
4. Lokal testen
5. Auf deinem Server mit Docker deployen

---

## 1. Supabase-Projekt anlegen

1. Gehe zu [supabase.com](https://supabase.com) und erstelle einen kostenlosen
   Account, dann ein neues Projekt (z. B. Name: `wowforever`).
2. Warte, bis das Projekt fertig eingerichtet ist (ca. 2 Minuten).
3. Gehe links im Menü auf **SQL Editor** → **New query**.
4. Öffne die Datei [`supabase/schema.sql`](./supabase/schema.sql) aus diesem
   Projekt, kopiere den kompletten Inhalt hinein und klicke **Run**.
   - Das erstellt die Tabelle `responses`, aktiviert Row Level Security
     (jede Person sieht nur ihre eigene Zeile) und legt die View
     `participants_overview` an (zeigt allen eingeloggten Nutzer:innen eine
     abgespeckte Übersicht ohne sensible Detailfelder).
5. Gehe zu **Project Settings** (Zahnrad unten links) → **API**. Dort
   findest du drei Werte, die du gleich brauchst:
   - **Project URL** → wird zu `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** Key → wird zu `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** Key (unter "Project API keys", eingeklappt, mit
     Warnhinweis) → wird zu `SUPABASE_SERVICE_ROLE_KEY`.
     ⚠️ **Diesen Key niemals öffentlich teilen oder ins Frontend einbauen** –
     er hebelt Row Level Security komplett aus. Wir verwenden ihn nur
     serverseitig im Admin-Dashboard.

---

## 2. Discord-App im Developer Portal anlegen

1. Gehe zu <https://discord.com/developers/applications> und logge dich mit
   deinem Discord-Account ein.
2. Klicke **New Application**, gib einen Namen ein (z. B. "WoW Forever
   Umfrage") und bestätige.
3. Im Menü links: **OAuth2** → **General**. Dort findest du:
   - **Client ID**
   - **Client Secret** (Klick auf "Reset Secret" bzw. "Copy", falls noch
     keins angezeigt wird)
4. Diese beiden Werte brauchst du **nicht** in deiner `.env` – sie werden
   direkt in Supabase eingetragen (siehe Schritt 3).
5. Die **Redirect URL** trägst du hier noch nicht ein – die bekommst du erst
   von Supabase, im nächsten Schritt.

---

## 3. Discord-Provider in Supabase aktivieren

1. Gehe in deinem Supabase-Projekt zu **Authentication** → **Providers**.
2. Suche **Discord** in der Liste und aktiviere ihn.
3. Trage dort **Client ID** und **Client Secret** aus Schritt 2 ein und
   speichere.
4. Supabase zeigt dir jetzt eine **Callback URL** an, meist im Format:
   `https://xxxxxxxxxxxx.supabase.co/auth/v1/callback`
   Kopiere diese URL.
5. Zurück im Discord Developer Portal → **OAuth2** → **General** → Abschnitt
   **Redirects**: Füge genau diese URL als Redirect hinzu und speichere.
6. Wichtig: Gehe in Supabase zu **Authentication** → **URL Configuration**
   und trage dort ein:
   - **Site URL**: die Adresse, unter der deine App später erreichbar ist
     (z. B. `https://umfrage.deine-domain.de`, siehe Schritt 6). Lokal zum
     Testen kannst du vorübergehend `http://localhost:3000` eintragen.
   - **Redirect URLs**: zusätzlich `http://localhost:3000/auth/callback`
     (für lokales Testen) und `https://umfrage.deine-domain.de/auth/callback`
     (für den Live-Betrieb) hinzufügen.

Das Scope "identify" (kein E-Mail-Zugriff) ist bereits im Code fest
hinterlegt (`components/LoginButton.tsx`) – du musst dafür in Discord
nichts extra einstellen.

---

## 4. Deine eigene Discord-User-ID herausfinden

1. Öffne Discord (App oder Browser).
2. Gehe zu **Benutzereinstellungen** (Zahnrad) → **Erweitert** →
   Schalter **Entwicklermodus** aktivieren.
3. Klicke irgendwo mit der rechten Maustaste auf deinen eigenen Namen/Avatar
   (z. B. in einer Server-Mitgliederliste oder oben links auf dein
   Profilbild) und wähle **"Benutzer-ID kopieren"**.
4. Das ist eine lange Zahl (z. B. `297344597339529219`) – das ist deine
   `ADMIN_DISCORD_IDS`.

Wiederhole das für jede Person, die auch Admin-Zugriff bekommen soll, und
trage alle IDs kommagetrennt ein (siehe nächster Schritt).

---

## 5. Umgebungsvariablen setzen

Kopiere `.env.local.example` zu `.env.local` (für lokales Testen):

```bash
cp .env.local.example .env.local
```

Trage dort ein:

```
NEXT_PUBLIC_SUPABASE_URL=...       # aus Schritt 1
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # aus Schritt 1
SUPABASE_SERVICE_ROLE_KEY=...      # aus Schritt 1
ADMIN_DISCORD_IDS=deine-id,weitere-id
```

**Lokal testen:**

```bash
npm install
npm run dev
```

Öffne <http://localhost:3000>, logge dich mit Discord ein, fülle die
Umfrage aus und schau dir `/admin` an (funktioniert nur, wenn deine
Discord-ID in `ADMIN_DISCORD_IDS` steht).

---

## 6. Deployment auf deinem eigenen Server (Hetzner, neben einem bestehenden nginx)

Dieses Setup geht davon aus, dass auf deinem Server bereits **nginx direkt
installiert** läuft (kein Docker) und dort schon ein anderes Projekt bedient
wird. Die Umfrage-App läuft deshalb als Docker-Container **nur intern** auf
Port `3001` (nicht von außen erreichbar), und das vorhandene nginx bekommt
eine zusätzliche Seite, die Anfragen von deiner DuckDNS-Adresse (z. B.
`deine-id.duckdns.org`) an diesen internen Port weiterleitet. Für das
HTTPS-Zertifikat nutzen wir `certbot`, der sich in nginx einklinkt.

Alle Befehle führst du direkt in deiner SSH-Sitzung auf dem Server aus.

### Voraussetzungen

- Docker + Docker-Compose-Plugin installiert (falls noch nicht vorhanden):
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Deine DuckDNS-Adresse zeigt bereits auf die IP deines Servers (hast du
  laut deinen Angaben schon eingerichtet).

### Schritt 1: Projekt auf den Server holen

```bash
git clone -b claude/wow-forever-survey-app-0p0ka6 https://github.com/kuestersrene-beep/Wowforever.git wowforever
cd wowforever
```

### Schritt 2: `.env` Datei anlegen

Am einfachsten fügst du den ganzen Block in einem Rutsch ein (Werte vorher
mit deinen echten Daten aus Supabase/Discord ersetzen), dann brauchst du
keinen Editor wie `nano`:

```bash
cat > .env << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-anon-oder-publishable-key
SUPABASE_SERVICE_ROLE_KEY=dein-service-role-oder-secret-key
ADMIN_DISCORD_IDS=deine-discord-id
EOF
```

Prüfen, ob alles richtig drinsteht:

```bash
cat .env
```

### Schritt 3: App bauen und starten (nur intern, Port 3001)

```bash
docker compose up -d --build
```

Testen, ob sie lokal auf dem Server antwortet (sollte HTML zurückgeben):

```bash
curl -I http://127.0.0.1:3001
```

### Schritt 4: Neue nginx-Seite für die DuckDNS-Adresse anlegen

Konfigurationsdatei anlegen (ersetze `deine-id.duckdns.org` durch deine
echte Adresse):

```bash
sudo tee /etc/nginx/sites-available/wowforever > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name deine-id.duckdns.org;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

Seite aktivieren und nginx neu laden:

```bash
sudo ln -s /etc/nginx/sites-available/wowforever /etc/nginx/sites-enabled/wowforever
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` prüft die Konfiguration auf Fehler, bevor irgendetwas
angewendet wird – falls hier ein Fehler erscheint, nichts weiter
ausführen und den Fehlertext genau lesen (meist ein Tippfehler in der
Domain).

Jetzt sollte `http://deine-id.duckdns.org` bereits die App zeigen (noch
ohne HTTPS).

### Schritt 5: HTTPS mit certbot einrichten

Falls certbot noch nicht installiert ist:

```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
```

Zertifikat holen und nginx automatisch auf HTTPS umstellen lassen:

```bash
sudo certbot --nginx -d deine-id.duckdns.org
```

Certbot fragt nach einer E-Mail-Adresse (für Ablauf-Erinnerungen) und ob
HTTP automatisch auf HTTPS umgeleitet werden soll – das kannst du
bestätigen. Die automatische Zertifikats-Erneuerung richtet certbot
selbstständig ein (Systemd-Timer), du musst dich um nichts weiter kümmern.

Jetzt sollte `https://deine-id.duckdns.org` funktionieren.

### Schritt 6: Redirect-URLs in Supabase finalisieren

Gehe in Supabase zu **Authentication → URL Configuration** und trage ein:

- **Site URL**: `https://deine-id.duckdns.org`
- **Redirect URLs**: zusätzlich `https://deine-id.duckdns.org/auth/callback`

Und im Discord Developer Portal unter **OAuth2 → General → Redirects**
sicherstellen, dass dort weiterhin nur die Supabase-Callback-URL steht
(die ändert sich durch dieses Setup nicht, siehe Abschnitt 3).

### Updates einspielen

```bash
git pull
docker compose up -d --build
```

### Logs ansehen

```bash
docker compose logs -f app
```

---

## 7. Datenschutz & Datenminimierung

- Gespeichert werden ausschließlich: Discord-User-ID, Anzeigename,
  Avatar-URL und die Umfrageantworten – keine E-Mail-Adresse, keine sonstigen
  Discord-Daten.
- Row Level Security sorgt dafür, dass jede Person nur ihre eigene Zeile
  lesen, ändern oder löschen kann.
- Über den "Antwort löschen"-Button auf der Umfrageseite kann jede Person
  ihre Daten jederzeit vollständig entfernen.
- Der `service_role`-Key (voller Datenbankzugriff) wird ausschließlich
  serverseitig im Admin-Dashboard verwendet und ist nie im Browser sichtbar.
- Es gibt keine Tracking-Skripte, Analytics oder Cookies außer den
  technisch notwendigen Login-Session-Cookies von Supabase.

---

## 8. Gilden-Funktionen: Charaktere, Termine & Aufstellung

Zusätzlich zur Umfrage gibt es eine kleine Raid-Planung (Idee und
Funktionsumfang angelehnt an Gilden-Tools wie GuildKit, siehe
[`docs/GUILDKIT-ANALYSIS.md`](./docs/GUILDKIT-ANALYSIS.md)):

- **`/charaktere`**: Jede Person trägt ihre Charaktere ein (Name, Klasse,
  Rolle, Level, Main/Twink). Für WoW Forever gibt es keine Armory, deshalb
  von Hand. Klasse und Rolle werden beim ersten Charakter aus der
  Umfrageantwort vorausgefüllt. Darunter steht das Gilden-Roster nach Rollen.
- **`/termine`**: Kommende und vergangene Termine mit Anmeldezahlen pro
  Rolle. Admins sehen oben ein Formular zum Anlegen, optional wöchentlich
  wiederkehrend (bis zu 12 Wochen, jeder Abend mit eigenen Anmeldungen).
- **`/termine/[id]`**: Anmeldung mit einem eigenen Charakter (*Dabei*,
  *Vorläufig*, *Abgemeldet*, mit Kommentar). Admins setzen Angemeldete auf
  *Bestätigt* oder *Bank*, posten die Aufstellung per Discord-Webhook und
  löschen Termine oder ganze Serien.

**Einrichtung:** `supabase/schema.sql` einfach erneut komplett im SQL
Editor ausführen. Das Skript ist wiederholbar und legt die neuen Tabellen
`characters`, `events`, `event_signups`, `event_roster` sowie die View
`event_signups_overview` an, ohne bestehende Daten zu verändern.

Neue Termine und gepostete Aufstellungen landen im selben Kanal wie die
Umfrage-Benachrichtigungen (`DISCORD_WEBHOOK_URL`). Termine werden in
`Europe/Berlin` angezeigt. Eine andere Zeitzone setzt du optional über
`NEXT_PUBLIC_TIME_ZONE`, zum Beispiel `NEXT_PUBLIC_TIME_ZONE=Europe/Vienna`.

**Rechte (per Row Level Security):** Alle Eingeloggten sehen Roster,
Termine und Anmeldungen. Jede Person ändert nur ihre eigenen Charaktere und
Anmeldungen, und nur mit eigenen Charakteren. Termine und die Aufstellung
schreiben ausschließlich Admins serverseitig über den `service_role`-Key.

**Wer ist Admin?** Alle, die im Discord die Rolle **Offizier** oder
**Gildenmeister** haben. Der Gilden-Bot meldet die Ränge alle 2 Minuten in
die Tabelle `discord_members` (siehe `discord-setup/rollensync.py`).
Zusätzlich gelten die IDs aus `ADMIN_DISCORD_IDS` immer als Admin – als
Notfall-Zugang, falls der Bot einmal nicht läuft.

---

## Projektstruktur

```
app/
  page.tsx                  Startseite (Login, Datenschutzhinweis)
  auth/callback/route.ts    OAuth-Callback von Discord/Supabase
  umfrage/page.tsx           Fragebogen
  umfrage/actions.ts         Server Actions: speichern & löschen
  uebersicht/page.tsx        Übersicht für alle eingeloggten Teilnehmer:innen
  admin/page.tsx              Admin-Dashboard
  charaktere/                 Eigene Charaktere + Gilden-Roster
  termine/                    Terminliste, Detailseite, Server Actions
components/
  CharacterManager.tsx        Charaktere anlegen/bearbeiten/löschen
  events/                     Termin-Formular, Anmeldung, Aufstellung
  LoginButton.tsx, LogoutButton.tsx, SurveyForm.tsx
  admin/                      Charts, Tabelle, CSV-Export, Kacheln
lib/
  supabase/                   Browser-, Server- und Admin-Client
  admin.ts                    Admin-Check: Discord-Rang (Offizier/Gildenmeister) oder ADMIN_DISCORD_IDS
  constants.ts, types.ts
supabase/schema.sql           Tabelle, RLS-Policies, Übersichts-View
Dockerfile, docker-compose.yml     Deployment auf eigenem Server
deploy/nginx-wowforever.conf.example   Beispiel für die nginx-Seite (Referenz)
```
