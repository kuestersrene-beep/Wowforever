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

-- Anmeldungen inkl. Charakter und Aufstellungs-Status für alle
-- eingeloggten Nutzer:innen (läuft mit den Rechten des Erstellers, siehe
-- Kommentar bei participants_overview).
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
    r.slot as roster_slot
  from public.event_signups s
  join public.characters c on c.id = s.character_id
  left join public.event_roster r
    on r.event_id = s.event_id and r.user_id = s.user_id;

revoke all on public.event_signups_overview from anon;
grant select on public.event_signups_overview to authenticated;

-- Nach Schema-Änderungen muss PostgREST seinen Schema-Cache neu laden,
-- sonst meldet die App "Could not find the table ... in the schema
-- cache" für neue Tabellen/Views.
notify pgrst, 'reload schema';
