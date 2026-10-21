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

-- Nach Schema-Änderungen muss PostgREST seinen Schema-Cache neu laden,
-- sonst meldet die App "Could not find the table ... in the schema
-- cache" für neue Tabellen/Views.
notify pgrst, 'reload schema';
