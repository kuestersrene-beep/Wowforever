# Analyse: Raid-Helper (raid-helper.dev)

Stand: 2026-10-25. Quellen: öffentliche Seiten von raid-helper.dev (Startseite, Dokumentation: Intro, Commands, Advanced, Reference, API). Kein Login, kein Bot eingeladen, keine Formulare abgeschickt. Aussagen zur Technik sind aus der öffentlichen Dokumentation abgeleitet.

## Was ist Raid-Helper?

Ein Discord-Bot zum **Planen von Events mit Anmeldungen direkt in Discord**, vor allem für Raids in MMOs. Er ist seit 2019 in Betrieb, mehrsprachig und hat Vorlagen für viele Spiele, darunter WoW, FFXIV, Guild Wars 2 und Lost Ark. Es gibt eine kostenlose Grundversion, einige Funktionen sind „Premium“, etwa wiederkehrende Events, temporäre Rollen und Webhooks. Dazu kommt ein Web-Dashboard, in dem man Events auch per Oberfläche anlegen kann.

## Kernfunktionen

| Bereich | Funktionen |
|---|---|
| Events anlegen | `/create` (Dialog per DM), `/quickcreate` (ein Befehl), Web-Dashboard, geplante Veröffentlichung („Post Time“), wiederkehrende Events (Premium) |
| Anmeldung | Event-Nachricht mit Emoji-Reaktionen bzw. Buttons je Klasse/Spec, dazu Status *Bench*, *Late*, *Tentative*, *Absence*. Spec wird gespeichert und wiederverwendet. Limits (gesamt und pro Person), Warteliste/Bench bei vollem Event |
| Verwaltung | `/edit`, `/close`, `/open`, `/add`, `/remove`, `/move`, `/copy`, `/sort`, `/recover`, `/delete` |
| Überblick | Zähler pro Rolle/Klasse in der Nachricht, Countdown, Discord-Zeitstempel in Ortszeit, Übersicht aller Events |
| Erinnern | `/signed` und `/unsigned`: alle Angemeldeten bzw. Nicht-Angemeldeten anschreiben. Grundlage für „unsigned“ sind festgelegte **Raider-Rollen**. Erinnerungen vor Eventbeginn (Einstellung *reminder*) |
| Auswertung | `/attendance` (Teilnahme-Statistik), `/export` (CSV), DKP-Verwaltung |
| Komfort | Discord-Event und Thread pro Event anlegen, temporäre Rolle für Angemeldete, Sprachkanal, Kurzcodes in Texten (`{eventTime}`, `{leader}` …) |
| Rechte | Admin bzw. „Manage Server“ darf alles. Dazu eine *Manager*-Rolle (alle Events bearbeiten) und eine *Assistant*-Rolle (eigene Events), eigene Rechtegruppen |
| Sonstiges | Reaction-Roles, Embeds, Willkommens-DM, Timer, Würfeln, Item-Suche (Classic/TBC) |

## Einstellungen (Ausschnitt aus „Advanced“)

Raid-Helper hat sehr viele Einstellungen, auf Server- und auf Event-Ebene. Die wichtigsten Gruppen:
- **Ablauf:** Dauer, Anmeldeschluss (*deadline*), Limit, Sperre bei Limit, Anmeldungen pro Person, Bench-Überlauf, Warteschlange
- **Anzeige:** was in der Nachricht steht (Titel, Leiter, Zähler, Rollen, Klassen, Nummerierung, Countdown, Datumsformat), eigene Emojis je Status
- **Benachrichtigung:** Erinnerung, Erwähnungen, Thread, Discord-Event, temporäre Rolle
- **Zugriff:** erlaubte und gesperrte Rollen, Opt-out

## Technik (abgeleitet)

- Discord-Bot mit Slash-Befehlen, DM-Dialogen, Kontextmenü („Apps → Edit / Unsigned“) und Buttons bzw. Reaktionen an der Event-Nachricht.
- Die **Event-ID ist die Discord-Nachrichten-ID**.
- Öffentliche REST-API (`raid-helper.xyz/api/v4`): Events lesen, anlegen, bearbeiten und löschen, Anmeldungen hinzufügen, ändern und entfernen, Mirrors, Embeds, DKP, Attendance, Comp-Tool. Webhooks bei Event-Änderungen (Premium).
- Datenmodell (aus der API ableitbar): **Server** → **Event** (Titel, Zeit, Kanal, Leiter, Einstellungen) → **Sign-ups** (Mitglied, Klasse/Spec, Rolle, Status, Position). Dazu **Comps** (Gruppen und Slots), **DKP** pro Mitglied, **Attendance** pro Event.

## Wichtige Abläufe

1. **Event anlegen:** Leiter startet `/create`, Dialog per DM (Vorlage, Titel, Datum, Zeit, Beschreibung, optionale Einstellungen) → Bot postet die Event-Nachricht im Kanal.
2. **Anmelden:** Mitglied klickt Klasse/Spec bzw. Status an der Nachricht → die Nachricht aktualisiert Liste und Zähler. Ein erneuter Klick ändert die Anmeldung.
3. **Vor dem Raid:** Leiter prüft die Zusammensetzung, verschiebt auf Bench, schreibt Nicht-Angemeldete per `/unsigned` an, der Bot erinnert vor Beginn.
4. **Start:** Anmeldung schließt automatisch zur Startzeit (± Deadline). Danach Teilnahme und Auswertung.

## Bezug zu unserem Projekt

- Der Gilden-Bot (`discord-setup/bot.py`, discord.py 2.4) hat bereits Buttons, Modals, dauerhafte Views (über Neustarts hinweg) und eine Offiziersprüfung. Slash-Befehle gibt es noch keine.
- Der Discord-Server hat schon passende Strukturen: Kanal `📅│raid-ankündigungen` (nur Raidleiter, Offiziere und Gildenmeister schreiben), Rollen *Raidleiter*, *Raider*, *Offizier*, *Gildenmeister*.
- Die Gilden-Website (Gildenhof, Supabase) hat **Termine, Anmeldungen (Dabei / Vorläufig / Abgemeldet), Charaktere und Aufstellung (Bestätigt / Bank)**. Ein Discord-Raid-Bot sollte diese Daten **nutzen statt verdoppeln**, damit ein Raid auf der Website und in Discord derselbe ist.
