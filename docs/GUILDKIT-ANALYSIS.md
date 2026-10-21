# Analyse: guildkit.app

Stand: 2026-10-21. Quellen: öffentliche Seiten (Startseite, `/setup`, `/guilds`), JSON-LD-Metadaten der Startseite, Netzwerk-Requests und das ausgelieferte JS-Bundle (`/assets/index-*.js` plus Lazy-Chunks). Es wurde nicht eingeloggt, kein Account angelegt und kein Formular abgeschickt. Alle Aussagen zur Architektur sind aus dem Frontend **abgeleitet**, nicht bestätigt.

## Was ist GuildKit?

Eine Plattform für Gilden-Websites und Gildenorganisation in **World of Warcraft**. Jede Gilde bekommt eine eigene, gebrandete Seite (`/g/:slug`, optional eigene Domain) mit Raid-Planung, Roster, Bewerbungen, Recruiting und Discord-Anbindung.

- **Zielgruppe:** Gildenleitung und Offiziere (Verwaltung) sowie Mitglieder (Anmeldung zu Raids, Profil, Nachrichten). Dazu Spieler, die eine Gilde suchen (öffentliches Verzeichnis).
- **Problem:** Gilden verteilen ihre Organisation auf Kalender, Google Sheets, Discord-Bots und Foren. GuildKit bündelt das an einem Ort.
- **Spielversionen:** Retail, MoP Classic, Classic Era/Anniversary, „WoW Forever". Die Oberfläche passt sich an: Retail bekommt automatischen Armory-Sync, Mythic+, Raidbots und Gear-Audit. Classic und Forever arbeiten mit manuell registrierten Charakteren und Warcraft-Logs-Importen.
- **Preis:** kostenlos zum Einstieg. Bezahlfunktionen laufen offenbar über Patreon (`patreon-oauth`, `patron_subscriptions`, `platform_feature_tiers`, RPC `guild_feature_access`).

## Funktionen

| Bereich | Funktionen |
|---|---|
| Raid-Abende | Monatskalender, wiederkehrende Events (Serien), rollenbasierte Anmeldung (Tank/Heal/DPS), Abmeldungen, Anwesenheit, Bank/Bench, Auto-Anmeldung |
| Raid-Planer | Roster pro Boss, Zuweisungen, MRT-Export (Note-Addon), Buff-Tracker, Kompositionen |
| Roster | Charakterprofile, Main/Twinks, Rang-Konfiguration, Raid-Teams |
| Fortschritt | Raid-Progression pro Boss, Warcraft-Logs-Berichte, Performance pro Raid-Abend, Offiziers-Evaluationen, KI-Zusammenfassungen |
| Loot | Loot-Historie, RCLootCouncil-Import, Loot-Vorschläge, Droptimizer (Raidbots, nur Retail) |
| Recruiting | Öffentliches Gildenverzeichnis (Filter nach Region/Version/„rekrutiert"), Recruiting-Bedarf pro Klasse/Spec, Bewerbungsformular, Offiziers-Votes, Notizen, Nachrichten-Thread mit Bewerbern, KI-Einschätzung, LFG-Profile für Spieler |
| Kommunikation | Interne Nachrichten/Konversationen, Benachrichtigungen, Support-Tickets, News-Artikel |
| Discord | Bot postet Raid-Events, Erinnerungen, Bewerbungsalarme; optionale Rollen-Synchronisierung |
| Website/CMS | Logo, Hero-Bild, Farben, Inhaltseditor, eigene Seiten (`/p/:pageSlug`), FAQ, Guides, Streamer, eigene Domain |
| Rechte | Rollen, Offiziers-Zuweisungen, Rechte pro Rang |

## Abgeleitete Architektur und Stack

- **Frontend:** React-SPA, gebaut mit Vite (ES-Module, gehashte Lazy-Chunks unter `/assets/`). React Router (verschachtelte Routen), Radix UI (shadcn/ui-Stil), lucide-Icons, sonner-Toasts. Schriften: Work Sans, Plus Jakarta Sans. Wowhead-Tooltips (`wow.zamimg.com/js/tooltips.js`).
- **Hosting/Builder:** Die Pfade `/__l5e/...`, `/~flock.js` und `/~api/analytics` deuten auf **Lovable** (KI-App-Builder) als Hosting und Analytics hin.
- **Backend:** **Supabase** (`*.supabase.co`). Das Frontend fragt Postgres direkt über PostgREST ab (`supabase.from(...)`). Sicherheit liegt also in Row-Level-Security-Regeln. Geschäftslogik steckt in Edge Functions und RPCs.
- **Edge Functions (beobachtet):** `battlenet-auth`, `sync-wow-characters`, `sync-guild-roster`, `sync-guild-progression`, `gear-audit`, `warcraftlogs-zones`, `manage-manual-character`, `submit-application`, `assess-application` (KI), `auto-signup-event`, `attendance-warning-sweep`, `parse-rcloot-export`, `send-notifications`, `discord-bot`, `discord-oauth`, `patreon-oauth`, `guildkit-admin`.
- **RPCs:** `set_own_main_character`, `is_guildkit_admin`, `guild_feature_access`.
- **Auth:** Login nur über Battle.net OAuth (Region wird vorab gewählt). Beim Setup prüft der Dienst, welche Gilden der Nutzer leitet.
- **Externe APIs:** Blizzard/Battle.net, Warcraft Logs, Raider.IO, Raidbots, Discord, Patreon.

## Datenmodell (aus Tabellennamen im Bundle)

- **Gilde:** `guild_settings` (Name, Slug, Realm, Region, game_version, Branding), `guild_rank_config`, `rank_permissions`, `officer_assignments`, `user_roles`, `guild_directory_listings` (is_listed, display_rank, seo_tagline), `cms_content`, `custom_pages`, `guild_news`, `guild_api_keys`
- **Nutzer und Charaktere:** `profiles` (battletag), `wow_characters` (is_main), `user_spec_preferences`, `guild_roster_members`
- **Raids:** `raid_teams`, `raid_team_members`, `raid_events` (guild_id, scheduled_at, series_id, raid_team_id, discord_post_at), `raid_events_archive`, `raid_signups`, `raid_signup_optouts`, `raid_roster_assignments`, `raid_boss_rosters`, `raid_boss_roster_assignments`
- **Mythic+:** `mplus_events`, `mplus_signups`, `mplus_teams`, `mplus_signup_optouts`
- **Fortschritt/Loot:** `guild_raid_progression`, `guild_raid_encounter_progression`, `loot_history`, `loot_suggestions`
- **Recruiting:** `recruitment_needs`, `recruitment_listings` / `v_recruitment_listings`, `recruitment_inquiries`, `player_lfg_profiles`, `guild_applications` (Status accepted/declined, ai_assessment), `application_messages`, `application_votes`, `application_notes`, `application_views`
- **Kommunikation:** `conversations`, `conversation_members`, `chat_messages`, `notifications`, `platform_feedback`
- **Integrationen/Plattform:** `discord_config`, `discord_raid_channels`, `patron_subscriptions`, `platform_feature_tiers`, `guildkit_platform_config`, `site_analytics`

## Wichtige Abläufe

1. **Gilde anlegen (`/setup`):** Spielversion und Region wählen → Battle.net-Login → Gilde auswählen, die man leitet → Branding anpassen (Logo, Farben) → fertig, Link zum Einladen der Mitglieder.
2. **Mitglied:** Battle.net-Login → Gildencharakter wählen (Classic/Forever: Charakter manuell registrieren) → Raid-Kalender, Anmeldungen, Nachrichten, Profil.
3. **Raid-Abend:** Offizier legt Event an (einmalig oder wiederkehrend) → Discord-Post → Mitglieder melden sich mit Rolle an → Offizier stellt Roster und Boss-Aufstellungen zusammen → Anwesenheit und Logs nach dem Raid.
4. **Recruiting:** Gilde pflegt Bedarf und Verzeichniseintrag → Spieler findet sie unter `/guilds` → Bewerbung → Offiziere stimmen ab, notieren und schreiben im Thread → annehmen oder ablehnen.
