-- ============================================================
-- WoW Forever Umfrage - Datenbank-Schema
-- Führe dieses Skript im Supabase Dashboard unter
-- "SQL Editor" -> "New query" einmal komplett aus.
-- ============================================================

create table if not exists public.responses (
  -- user_id verweist auf den Supabase-Auth-Nutzer (1 Zeile pro Person).
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Für Anzeige/Filterung ohne Join, wird beim Speichern aus der
  -- Discord-Session übernommen.
  discord_id text not null,
  display_name text not null,
  first_name text,
  avatar_url text,

  participation text not null check (participation in ('ja', 'vielleicht', 'nein')),
  faction text check (faction in ('horde', 'allianz', 'egal')),
  playstyle text check (playstyle in ('pvp', 'pve', 'beides')),
  -- Bis zu 3 Klassen in Prioritäts-Reihenfolge (Index 0 = 1. Wahl).
  classes text[],
  role text check (role in ('tank', 'heiler', 'dd')),
  professions text[],
  frequency text check (frequency in ('gelegentlich', 'mehrmals_woche', 'fast_taeglich')),
  comment text,

  updated_at timestamptz not null default now()
);

comment on table public.responses is 'Eine Zeile pro Discord-Nutzer mit ihrer/seiner WoW-Forever-Umfrageantwort.';

-- Falls du dieses Skript auf einer bereits bestehenden Datenbank erneut
-- ausführst (z. B. weil first_name nachträglich dazugekommen ist): dieser
-- Befehl ergänzt die Spalte, ohne bestehende Daten zu verändern.
alter table public.responses add column if not exists first_name text;

-- Migration: aus der alten einzelnen "class"-Spalte wird "classes"
-- (eine Prioritätenliste). Bestehende Werte werden als 1. Priorität
-- übernommen, danach wird die alte Spalte entfernt.
alter table public.responses add column if not exists classes text[];
alter table public.responses add column if not exists professions text[];

-- Muss VOR dem Drop von "class" passieren, weil die View unten sonst
-- noch von der alten Spalte abhängt und Postgres das Löschen verweigert
-- (Fehler 2BP01 "cannot drop column ... because other objects depend on it").
drop view if exists public.participants_overview;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'responses' and column_name = 'class'
  ) then
    update public.responses
    set classes = array[class]
    where class is not null and classes is null;

    alter table public.responses drop column class;
  end if;
end $$;

-- ============================================================
-- Admin-Notizen: eine kurze Anmerkung pro Teilnehmer:in, die NUR
-- Admins hinzufügen/ändern können. Bewusst eine eigene Tabelle statt
-- einer weiteren Spalte in "responses" - die "update own response"-
-- Policy oben erlaubt jeder Person, JEDE Spalte ihrer eigenen Zeile zu
-- ändern (RLS ist zeilen-, nicht spaltenbasiert). Mit einer separaten
-- Tabelle ohne jegliche Policy für normale Nutzer:innen ist die
-- Notiz für sie komplett unsichtbar/nicht schreibbar (RLS blockt per
-- Default alles), außer über die read-only View weiter unten.
-- ============================================================

create table if not exists public.admin_notes (
  user_id uuid primary key references public.responses (user_id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;
-- Absichtlich keine Policies hier: normale Nutzer:innen (anon key)
-- haben dadurch weder Lese- noch Schreibzugriff. Nur der
-- service_role-Key (Admin-Dashboard) umgeht RLS und darf schreiben.

-- updated_at automatisch aktualisieren, wenn eine Zeile geändert wird
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.responses;
create trigger set_updated_at
  before update on public.responses
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_updated_at_notes on public.admin_notes;
create trigger set_updated_at_notes
  before update on public.admin_notes
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- Jede Person darf ausschließlich ihre eigene Zeile lesen,
-- anlegen, ändern und löschen. Das Admin-Dashboard umgeht RLS
-- serverseitig über den "service_role" Key (siehe lib/supabase/server.ts)
-- und prüft die Admin-Berechtigung stattdessen in der App gegen die
-- Umgebungsvariable ADMIN_DISCORD_IDS.
-- ============================================================

alter table public.responses enable row level security;

drop policy if exists "select own response" on public.responses;
create policy "select own response"
  on public.responses for select
  using (auth.uid() = user_id);

drop policy if exists "insert own response" on public.responses;
create policy "insert own response"
  on public.responses for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own response" on public.responses;
create policy "update own response"
  on public.responses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own response" on public.responses;
create policy "delete own response"
  on public.responses for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Übersicht für alle eingeloggten Teilnehmer:innen (/uebersicht)
-- Views laufen standardmäßig mit den Rechten des Erstellers (nicht des
-- aufrufenden Nutzers) und umgehen damit gezielt die RLS-Policy oben -
-- aber NUR für die hier ausgewählten, unkritischen Spalten. Häufigkeit
-- und Kommentar bleiben weiterhin ausschließlich im Admin-Dashboard
-- sichtbar (dort per service_role Key).
-- ============================================================

-- DROP + CREATE statt CREATE OR REPLACE: Postgres erlaubt bei
-- CREATE OR REPLACE VIEW nur neue Spalten ans Ende anzuhängen, nicht
-- mittendrin einzufügen (sonst Fehler 42P16 "cannot change name of
-- view column"). Der DROP dafür ist bereits weiter oben passiert
-- (vor der class -> classes Migration).
create view public.participants_overview as
  select
    r.user_id,
    r.discord_id,
    r.display_name,
    r.first_name,
    r.avatar_url,
    r.participation,
    r.faction,
    r.playstyle,
    r.classes,
    r.role,
    r.professions,
    n.note as admin_note
  from public.responses r
  left join public.admin_notes n on n.user_id = r.user_id;

revoke all on public.participants_overview from anon;
grant select on public.participants_overview to authenticated;

-- ============================================================
-- Verfügbarkeit: grobe Zeitfenster (Wochentag x Tagesabschnitt), damit
-- sich Leute vorab zu Spielgruppen verabreden können. Eine Zeile pro
-- Nutzer:in, "slots" enthält Codes wie "mon_evening", "sat_afternoon".
-- Eigene Tabelle mit denselben "nur eigene Zeile"-Policies wie
-- "responses" - für die Überschneidungs-Ansicht auf /uebersicht gibt
-- es unten eine eigene View (wie bei participants_overview).
-- ============================================================

create table if not exists public.availability (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slots text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.availability enable row level security;

drop policy if exists "select own availability" on public.availability;
create policy "select own availability"
  on public.availability for select
  using (auth.uid() = user_id);

drop policy if exists "insert own availability" on public.availability;
create policy "insert own availability"
  on public.availability for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own availability" on public.availability;
create policy "update own availability"
  on public.availability for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own availability" on public.availability;
create policy "delete own availability"
  on public.availability for delete
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at_availability on public.availability;
create trigger set_updated_at_availability
  before update on public.availability
  for each row
  execute function public.set_updated_at();

-- DROP + CREATE statt CREATE OR REPLACE, aus demselben Grund wie bei
-- participants_overview weiter oben (siehe Kommentar dort).
drop view if exists public.availability_overview;
create view public.availability_overview as
  select
    a.user_id,
    a.slots,
    r.discord_id,
    r.first_name,
    r.display_name,
    r.avatar_url
  from public.availability a
  left join public.responses r on r.user_id = a.user_id;

revoke all on public.availability_overview from anon;
grant select on public.availability_overview to authenticated;

-- ============================================================
-- Downloads: eine Liste von Dateien/Links (z. B. Leveling-Guides),
-- die nur Admins anlegen/ändern/löschen können (service_role, siehe
-- app/admin/actions.ts), aber alle eingeloggten Nutzer:innen sehen
-- dürfen. Bewusst eine einfache "select (true)"-Policy statt einer
-- View, weil hier (anders als bei admin_notes) keine Spalten vor
-- normalen Nutzer:innen versteckt werden müssen.
-- ============================================================

create table if not exists public.downloads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text not null,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.downloads enable row level security;

drop policy if exists "select all downloads" on public.downloads;
create policy "select all downloads"
  on public.downloads for select
  using (true);
-- Absichtlich keine insert/update/delete-Policy für normale
-- Nutzer:innen - nur der service_role Key (Admin-Dashboard) darf
-- schreiben.

-- ============================================================
-- Charaktere: jede Person kann mehrere Charaktere anlegen (Main +
-- Twinks). Für WoW Forever gibt es keine öffentliche Armory, deshalb
-- werden sie von Hand gepflegt. Anzeigename/Avatar werden beim
-- Speichern aus der Discord-Session übernommen (wie bei "responses"),
-- damit Roster und Anmeldungen auch für Leute ohne Umfrageantwort
-- einen Namen haben.
-- Alle eingeloggten Nutzer:innen dürfen alle Charaktere sehen (das ist
-- das Gilden-Roster), aber nur die eigenen anlegen/ändern/löschen.
-- ============================================================

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  discord_id text not null,
  display_name text not null,
  avatar_url text,
  name text not null check (char_length(name) between 2 and 24),
  class text not null,
  role text not null check (role in ('tank', 'heiler', 'dd')),
  level int not null default 1 check (level between 1 and 100),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Höchstens ein Main pro Person.
create unique index if not exists characters_one_main_per_user
  on public.characters (user_id) where is_main;

alter table public.characters enable row level security;

drop policy if exists "select all characters" on public.characters;
create policy "select all characters"
  on public.characters for select
  to authenticated
  using (true);

drop policy if exists "insert own character" on public.characters;
create policy "insert own character"
  on public.characters for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own character" on public.characters;
create policy "update own character"
  on public.characters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own character" on public.characters;
create policy "delete own character"
  on public.characters for delete
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at_characters on public.characters;
create trigger set_updated_at_characters
  before update on public.characters
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Termine (Raids, Dungeon-Abende, ...): nur Admins legen an/ändern/
-- löschen (service_role, siehe app/termine/actions.ts), alle
-- eingeloggten Nutzer:innen dürfen lesen. Wiederkehrende Termine
-- werden als einzelne Zeilen mit gemeinsamer series_id angelegt, damit
-- jeder Abend eigene Anmeldungen hat.
-- ============================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid,
  title text not null,
  instance text,
  description text,
  starts_at timestamptz not null,
  max_size int not null default 40 check (max_size between 1 and 40),
  created_at timestamptz not null default now()
);

create index if not exists events_starts_at on public.events (starts_at);

alter table public.events enable row level security;

drop policy if exists "select all events" on public.events;
create policy "select all events"
  on public.events for select
  to authenticated
  using (true);
-- Absichtlich keine insert/update/delete-Policy - nur service_role.

-- ============================================================
-- Anmeldungen: eine Zeile pro Person und Termin. Jede Person darf nur
-- ihre eigene Anmeldung anlegen/ändern/löschen, und nur mit einem
-- eigenen Charakter (Prüfung über exists() in der Policy).
-- ============================================================

create table if not exists public.event_signups (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  status text not null check (status in ('dabei', 'vorlaeufig', 'abgemeldet')),
  comment text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_signups enable row level security;

drop policy if exists "select all signups" on public.event_signups;
create policy "select all signups"
  on public.event_signups for select
  to authenticated
  using (true);

drop policy if exists "insert own signup" on public.event_signups;
create policy "insert own signup"
  on public.event_signups for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.characters c
      where c.id = character_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "update own signup" on public.event_signups;
create policy "update own signup"
  on public.event_signups for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.characters c
      where c.id = character_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "delete own signup" on public.event_signups;
create policy "delete own signup"
  on public.event_signups for delete
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at_signups on public.event_signups;
create trigger set_updated_at_signups
  before update on public.event_signups
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Aufstellung: Admins setzen Angemeldete auf "bestaetigt" oder "bank".
-- Bewusst eine eigene Tabelle statt einer Spalte in event_signups -
-- aus demselben Grund wie bei admin_notes: RLS ist zeilen-, nicht
-- spaltenbasiert, sonst könnte sich jede Person selbst bestätigen.
-- Keine Policies: nur service_role schreibt, gelesen wird über die
-- View unten.
-- ============================================================

create table if not exists public.event_roster (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('bestaetigt', 'bank')),
  primary key (event_id, user_id)
);

alter table public.event_roster enable row level security;

-- ============================================================
-- Raid-Anmeldung im Discord (discord-setup/raid.py): Der Gilden-Bot
-- postet jeden Termin in Discord und nimmt dort Anmeldungen per Button
-- entgegen. Er schreibt ausschließlich über den service_role Key.
-- ============================================================

-- Wo die Discord-Nachricht zu einem Termin steht, ob die Erinnerung
-- schon raus ist und ob die Anmeldung vorzeitig geschlossen wurde.
alter table public.events add column if not exists discord_channel_id text;
alter table public.events add column if not exists discord_message_id text;
alter table public.events add column if not exists reminder_sent boolean not null default false;
alter table public.events add column if not exists signups_closed boolean not null default false;

-- Anmeldungen von Leuten ohne Konto auf der Website (nur Discord). Wer
-- auf der Website einen Charakter hat, landet stattdessen in
-- event_signups - der Bot ordnet das über characters.discord_id zu.
-- Klasse und Rolle können bei "abgemeldet" fehlen. roster_slot wird nur
-- von Admins gesetzt (Website) - Mitglieder schreiben hier nie direkt.
create table if not exists public.discord_event_signups (
  event_id uuid not null references public.events (id) on delete cascade,
  discord_id text not null,
  display_name text not null,
  avatar_url text,
  class text,
  role text check (role in ('tank', 'heiler', 'dd')),
  status text not null check (status in ('dabei', 'vorlaeufig', 'abgemeldet')),
  comment text,
  roster_slot text check (roster_slot in ('bestaetigt', 'bank')),
  updated_at timestamptz not null default now(),
  primary key (event_id, discord_id)
);

alter table public.discord_event_signups enable row level security;
-- Keine Policies: lesen über die View unten, schreiben nur service_role.

drop trigger if exists set_updated_at_discord_signups on public.discord_event_signups;
create trigger set_updated_at_discord_signups
  before update on public.discord_event_signups
  for each row
  execute function public.set_updated_at();

-- Die zuletzt im Discord gewählte Klasse je Person, damit der Bot nicht
-- bei jeder Anmeldung neu fragt.
create table if not exists public.discord_profiles (
  discord_id text primary key,
  class text not null,
  updated_at timestamptz not null default now()
);

alter table public.discord_profiles enable row level security;
-- Keine Policies: nur service_role.

-- Anmeldungen inkl. Charakter und Aufstellungs-Status für alle
-- eingeloggten Nutzer:innen (läuft mit den Rechten des Erstellers, siehe
-- Kommentar bei participants_overview). Enthält Website- und
-- Discord-Anmeldungen; "source" sagt, woher eine Zeile stammt.
drop view if exists public.event_signups_overview;
create view public.event_signups_overview as
  select
    s.event_id,
    s.user_id,
    s.status,
    s.comment,
    s.updated_at,
    c.id as character_id,
    c.name as character_name,
    c.class,
    c.role,
    c.level,
    c.discord_id,
    c.display_name,
    c.avatar_url,
    r.slot as roster_slot,
    'web'::text as source
  from public.event_signups s
  join public.characters c on c.id = s.character_id
  left join public.event_roster r
    on r.event_id = s.event_id and r.user_id = s.user_id
  union all
  select
    d.event_id,
    null::uuid as user_id,
    d.status,
    d.comment,
    d.updated_at,
    null::uuid as character_id,
    d.display_name as character_name,
    d.class,
    d.role,
    1 as level,
    d.discord_id,
    d.display_name,
    d.avatar_url,
    d.roster_slot,
    'discord'::text as source
  from public.discord_event_signups d;

revoke all on public.event_signups_overview from anon;
grant select on public.event_signups_overview to authenticated;

-- ============================================================
-- Seiten-Einstellungen: genau eine Zeile (id = 1), z. B. die URL eines
-- eigenen Logos. Lesen darf jede:r - auch nicht eingeloggte Besucher,
-- weil das Logo schon auf der Startseite vor dem Login erscheint.
-- Schreiben nur Admins über den service_role Key (siehe
-- app/admin/actions.ts).
-- ============================================================

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  logo_url text,
  updated_at timestamptz not null default now()
);

-- Eigenes Logo nur für den Countdown auf der Startseite (unabhängig vom
-- Haupt-Logo und dessen Größe). Leer = eingebautes Emblem.
alter table public.site_settings
  add column if not exists timer_logo_url text;

-- Größe des Logos in Prozent der jeweiligen Standardgröße (100 = normal).
alter table public.site_settings
  add column if not exists logo_scale int not null default 100;

-- Erlaubter Bereich 100-400 %. Constraint immer neu anlegen, damit auch
-- Datenbanken mit der früheren Grenze (50-200 %) aktualisiert werden.
alter table public.site_settings
  drop constraint if exists site_settings_logo_scale_check;
update public.site_settings
  set logo_scale = least(400, greatest(100, logo_scale));
alter table public.site_settings
  add constraint site_settings_logo_scale_check
  check (logo_scale between 100 and 400);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "select site settings" on public.site_settings;
create policy "select site settings"
  on public.site_settings for select
  using (true);
-- Absichtlich keine insert/update/delete-Policy - nur service_role.

drop trigger if exists set_updated_at_site_settings on public.site_settings;
create trigger set_updated_at_site_settings
  before update on public.site_settings
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Gildennamen-Umfrage: jede Person kann eigene Namen vorschlagen. Ein
-- Vorschlag ist zunächst "offen" und nur für die vorschlagende Person
-- sichtbar. Erst wenn ein Admin ihn freigibt ("freigegeben"), sehen ihn
-- alle und können dafür stimmen. Freigeben/Ablehnen/Löschen nur über den
-- service_role Key (siehe app/gildenname/actions.ts).
-- ============================================================

create table if not exists public.guild_name_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  status text not null default 'offen'
    check (status in ('offen', 'freigegeben', 'abgelehnt')),
  created_at timestamptz not null default now()
);

-- Jeder Name nur einmal (Groß-/Kleinschreibung egal).
create unique index if not exists guild_name_suggestions_name_unique
  on public.guild_name_suggestions (lower(name));

alter table public.guild_name_suggestions enable row level security;

drop policy if exists "select approved or own suggestions" on public.guild_name_suggestions;
create policy "select approved or own suggestions"
  on public.guild_name_suggestions for select
  to authenticated
  using (status = 'freigegeben' or auth.uid() = user_id);

-- Eigene Vorschläge nur als "offen" anlegen - freigeben kann sich
-- niemand selbst.
drop policy if exists "insert own suggestion" on public.guild_name_suggestions;
create policy "insert own suggestion"
  on public.guild_name_suggestions for insert
  with check (auth.uid() = user_id and status = 'offen');

-- Eigene, noch offene Vorschläge darf man zurückziehen.
drop policy if exists "delete own open suggestion" on public.guild_name_suggestions;
create policy "delete own open suggestion"
  on public.guild_name_suggestions for delete
  using (auth.uid() = user_id and status = 'offen');

-- Stimmen: eine Stimme pro Person (änderbar), nur für freigegebene Namen.
create table if not exists public.guild_name_votes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suggestion_id uuid not null references public.guild_name_suggestions (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.guild_name_votes enable row level security;

drop policy if exists "select all votes" on public.guild_name_votes;
create policy "select all votes"
  on public.guild_name_votes for select
  to authenticated
  using (true);

drop policy if exists "insert own vote" on public.guild_name_votes;
create policy "insert own vote"
  on public.guild_name_votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.guild_name_suggestions s
      where s.id = suggestion_id and s.status = 'freigegeben'
    )
  );

drop policy if exists "update own vote" on public.guild_name_votes;
create policy "update own vote"
  on public.guild_name_votes for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.guild_name_suggestions s
      where s.id = suggestion_id and s.status = 'freigegeben'
    )
  );

drop policy if exists "delete own vote" on public.guild_name_votes;
create policy "delete own vote"
  on public.guild_name_votes for delete
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at_guild_name_votes on public.guild_name_votes;
create trigger set_updated_at_guild_name_votes
  before update on public.guild_name_votes
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Bearbeitbare Seitentexte (Admin-Dashboard -> "Texte bearbeiten").
-- Jede Zeile überschreibt einen eingebauten Text aus lib/i18n/*.ts,
-- z. B. key = 'home.decisionTitle', locale = 'de'. Fehlt eine Zeile,
-- gilt der eingebaute Text. locale = 'all' für sprachunabhängige
-- Einstellungen wie das Ein-/Ausblenden von Abschnitten.
-- Lesen darf jede:r (die Startseite ist auch ohne Login sichtbar),
-- schreiben nur Admins über den service_role Key.
-- ============================================================

create table if not exists public.site_content (
  key text not null check (char_length(key) <= 100),
  locale text not null check (locale in ('de', 'en', 'all')),
  value text not null check (char_length(value) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (key, locale)
);

alter table public.site_content enable row level security;

drop policy if exists "select site content" on public.site_content;
create policy "select site content"
  on public.site_content for select
  using (true);
-- Absichtlich keine insert/update/delete-Policy - nur service_role.

drop trigger if exists set_updated_at_site_content on public.site_content;
create trigger set_updated_at_site_content
  before update on public.site_content
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Kurzabstimmungen auf der Startseite (z. B. "RP-PvP-Server?"). Admins
-- legen sie im Admin-Dashboard an und schalten sie aktiv; aktive
-- Abstimmungen erscheinen oben auf der Startseite. Eine Stimme pro
-- Person und Abstimmung, jederzeit änderbar - aber nur, solange die
-- Abstimmung aktiv ist.
-- ============================================================

create table if not exists public.quick_polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 3 and 300),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.quick_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.quick_polls (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  sort_order int not null default 0
);

create table if not exists public.quick_poll_votes (
  poll_id uuid not null references public.quick_polls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option_id uuid not null references public.quick_poll_options (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.quick_polls enable row level security;
alter table public.quick_poll_options enable row level security;
alter table public.quick_poll_votes enable row level security;

-- Frage und Antworten sieht jede:r (Startseite auch ohne Login),
-- Ergebnisse nur eingeloggte Nutzer:innen.
drop policy if exists "select quick polls" on public.quick_polls;
create policy "select quick polls"
  on public.quick_polls for select
  using (true);

drop policy if exists "select quick poll options" on public.quick_poll_options;
create policy "select quick poll options"
  on public.quick_poll_options for select
  using (true);

drop policy if exists "select quick poll votes" on public.quick_poll_votes;
create policy "select quick poll votes"
  on public.quick_poll_votes for select
  to authenticated
  using (true);

-- Abstimmen nur für sich selbst, nur in aktiven Abstimmungen und nur
-- mit einer Antwort, die zu dieser Abstimmung gehört.
drop policy if exists "insert own quick poll vote" on public.quick_poll_votes;
create policy "insert own quick poll vote"
  on public.quick_poll_votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.quick_poll_options o
      join public.quick_polls p on p.id = o.poll_id
      where o.id = option_id and o.poll_id = quick_poll_votes.poll_id and p.active
    )
  );

drop policy if exists "update own quick poll vote" on public.quick_poll_votes;
create policy "update own quick poll vote"
  on public.quick_poll_votes for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.quick_poll_options o
      join public.quick_polls p on p.id = o.poll_id
      where o.id = option_id and o.poll_id = quick_poll_votes.poll_id and p.active
    )
  );

drop policy if exists "delete own quick poll vote" on public.quick_poll_votes;
create policy "delete own quick poll vote"
  on public.quick_poll_votes for delete
  using (
    auth.uid() = user_id
    and exists (select 1 from public.quick_polls p where p.id = poll_id and p.active)
  );
-- Anlegen/Ändern/Löschen von Abstimmungen nur über service_role.

drop trigger if exists set_updated_at_quick_poll_votes on public.quick_poll_votes;
create trigger set_updated_at_quick_poll_votes
  before update on public.quick_poll_votes
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Discord-Ränge der Mitglieder (discord-setup/rollensync.py). Der Bot
-- schreibt regelmäßig, welche Rang-Rollen (Gildenmeister, Offizier, ...)
-- jedes Mitglied im Discord hat. Die Website leitet daraus ab, wer Admin
-- ist (lib/admin.ts). Keine Policies: lesen und schreiben nur über den
-- service_role Key - niemand kann sich selbst einen Rang eintragen.
-- ============================================================

create table if not exists public.discord_members (
  discord_id text primary key,
  display_name text not null,
  ranks text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.discord_members enable row level security;

drop trigger if exists set_updated_at_discord_members on public.discord_members;
create trigger set_updated_at_discord_members
  before update on public.discord_members
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Gildenentwürfe ("/fraktionen"): konkurrierende Lore-/Fraktions-
-- Konzepte, die zur Wahl stehen. Lesen darf jede:r eingeloggte Person,
-- anlegen/ändern/löschen/aktivieren nur Admins über den service_role
-- Key (siehe app/fraktionen/actions.ts). "active" ist absichtlich ohne
-- DB-Constraint auf "nur einer darf aktiv sein" - das regelt die
-- Admin-Action (setzt beim Aktivieren alle anderen zurück), einfacher
-- als ein Partial-Unique-Index und für diesen Anwendungsfall genug.
-- ============================================================

create table if not exists public.guild_drafts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) <= 100),
  tagline text check (char_length(tagline) <= 100),
  summary text check (char_length(summary) <= 500),
  lore_html text check (char_length(lore_html) <= 10000),
  rank_structure_html text check (char_length(rank_structure_html) <= 10000),
  -- Nachgebauter WoW-Item-Tooltip für den Wappenrock (lila Titel, weiße
  -- Meta-Zeilen, grüne Effekt-Zeilen, orange Flavor-Zeile am Ende - wie
  -- im echten Spiel). Bewusst einfache Textfelder statt Rich-HTML, weil
  -- die Farbgebung pro Zeilentyp fest ist, nicht frei wählbar.
  tooltip_title text check (char_length(tooltip_title) <= 100),
  tooltip_meta text check (char_length(tooltip_meta) <= 300),
  tooltip_effects text check (char_length(tooltip_effects) <= 1000),
  tooltip_quote text check (char_length(tooltip_quote) <= 300),
  image_url text,
  crest_url text,
  tabard_url text,
  banner_url text,
  -- [{ "icon": "🪓", "label": "Kriegshäuptling" }, ...]
  core_figures jsonb not null default '[]',
  sitz text check (char_length(sitz) <= 200),
  anfuehrer text check (char_length(anfuehrer) <= 100),
  feinde text check (char_length(feinde) <= 200),
  primaerwert text check (char_length(primaerwert) <= 50),
  active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration für bereits bestehende Installationen: tooltip_html
-- (Rich-HTML) wird durch die drei festen Textfelder ersetzt.
alter table public.guild_drafts add column if not exists tooltip_meta text;
alter table public.guild_drafts add column if not exists tooltip_effects text;
alter table public.guild_drafts add column if not exists tooltip_quote text;
alter table public.guild_drafts drop column if exists tooltip_html;

alter table public.guild_drafts enable row level security;

drop policy if exists "select guild drafts" on public.guild_drafts;
create policy "select guild drafts"
  on public.guild_drafts for select
  to authenticated
  using (true);
-- Absichtlich keine insert/update/delete-Policy - nur service_role.

drop trigger if exists set_updated_at_guild_drafts on public.guild_drafts;
create trigger set_updated_at_guild_drafts
  before update on public.guild_drafts
  for each row
  execute function public.set_updated_at();

-- Nach Schema-Änderungen muss PostgREST seinen Schema-Cache neu laden,
-- sonst meldet die App "Could not find the table ... in the schema
-- cache" für neue Tabellen/Views.
notify pgrst, 'reload schema';
