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
  class text,
  role text check (role in ('tank', 'heiler', 'dd')),
  frequency text check (frequency in ('gelegentlich', 'mehrmals_woche', 'fast_taeglich')),
  comment text,

  updated_at timestamptz not null default now()
);

comment on table public.responses is 'Eine Zeile pro Discord-Nutzer mit ihrer/seiner WoW-Forever-Umfrageantwort.';

-- Falls du dieses Skript auf einer bereits bestehenden Datenbank erneut
-- ausführst (z. B. weil first_name nachträglich dazugekommen ist): dieser
-- Befehl ergänzt die Spalte, ohne bestehende Daten zu verändern.
alter table public.responses add column if not exists first_name text;

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
-- aber NUR für die hier ausgewählten, unkritischen Spalten. Klasse,
-- Rolle, Häufigkeit und Kommentar bleiben so weiterhin ausschließlich
-- im Admin-Dashboard sichtbar (dort per service_role Key).
-- ============================================================

create or replace view public.participants_overview as
  select
    user_id,
    display_name,
    first_name,
    avatar_url,
    participation,
    faction,
    playstyle
  from public.responses;

revoke all on public.participants_overview from anon;
grant select on public.participants_overview to authenticated;
