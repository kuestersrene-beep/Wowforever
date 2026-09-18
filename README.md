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

## 6. Deployment auf deinem eigenen Server (Hetzner)

Die App läuft als Docker-Container. Vor der Tür steht **Caddy** als
Reverse-Proxy – er kümmert sich automatisch um ein kostenloses
HTTPS-Zertifikat (Let's Encrypt), du musst dafür nichts konfigurieren außer
deiner Domain.

### Voraussetzungen auf dem Server

- Ein A-Record deiner Domain (z. B. `umfrage.deine-domain.de`), der auf die
  IP deines Hetzner-Servers zeigt (in der DNS-Verwaltung deines
  Domain-Anbieters).
- Docker und das Docker-Compose-Plugin installiert:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Ports 80 und 443 müssen frei sein (falls dort schon nginx/Apache läuft,
  entweder stoppen oder die App stattdessen hinter deinen bestehenden
  Reverse-Proxy hängen – dann Caddy im `docker-compose.yml` weglassen und
  nur den `app`-Container auf einen internen Port mappen).

### Deployment-Schritte

1. Projekt auf den Server bringen (klonen oder per `git pull`):
   ```bash
   git clone <dein-repo-url> wowforever
   cd wowforever
   ```
2. `.env` Datei mit den echten Werten aus Schritt 5 anlegen:
   ```bash
   cp .env.local.example .env
   nano .env   # Werte eintragen
   ```
3. In `Caddyfile` die Domain anpassen (`umfrage.deine-domain.de` durch deine
   echte Domain ersetzen).
4. Bauen und starten:
   ```bash
   docker compose up -d --build
   ```
   Beim ersten Start holt sich Caddy automatisch ein SSL-Zertifikat für
   deine Domain – das dauert meist unter einer Minute.
5. Aufrufen: `https://umfrage.deine-domain.de` sollte jetzt funktionieren.

### Nach dem ersten Deployment: Redirect-URLs finalisieren

Falls du in Schritt 3 nur `localhost` eingetragen hattest, jetzt in Supabase
unter **Authentication → URL Configuration** die **Site URL** und
**Redirect URLs** auf deine echte Domain aktualisieren
(`https://umfrage.deine-domain.de` bzw.
`https://umfrage.deine-domain.de/auth/callback`).

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

## Projektstruktur

```
app/
  page.tsx                  Startseite (Login, Datenschutzhinweis)
  auth/callback/route.ts    OAuth-Callback von Discord/Supabase
  umfrage/page.tsx           Fragebogen
  umfrage/actions.ts         Server Actions: speichern & löschen
  uebersicht/page.tsx        Übersicht für alle eingeloggten Teilnehmer:innen
  admin/page.tsx              Admin-Dashboard
components/
  LoginButton.tsx, LogoutButton.tsx, SurveyForm.tsx
  admin/                      Charts, Tabelle, CSV-Export, Kacheln
lib/
  supabase/                   Browser-, Server- und Admin-Client
  admin.ts                    Admin-Check anhand ADMIN_DISCORD_IDS
  constants.ts, types.ts
supabase/schema.sql           Tabelle, RLS-Policies, Übersichts-View
Dockerfile, docker-compose.yml, Caddyfile   Deployment auf eigenem Server
```
