-- Our Cinema — Supabase setup. Safe to run more than once.

create extension if not exists pgcrypto;

-- Only these two accounts can read or change anything.
-- Replace the two placeholder emails before running.
create or replace function public.member_name()
returns text
language sql
stable
set search_path = ''
as $$
  select case lower(coalesce(auth.jwt() ->> 'email', ''))
    when 'aleks@example.com' then 'Aleks'
    when 'alina@example.com' then 'Alina'
    else null
  end;
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.member_name() is not null;
$$;

create table if not exists public.films (
  id           uuid primary key default gen_random_uuid(),
  tmdb_id      integer,
  media_type   text not null default 'movie' check (media_type in ('movie', 'tv')),
  name_en      text not null default '',
  name_ua      text not null default '',
  year         integer,
  runtime      integer,
  genres       text[] not null default '{}',
  desc_en      text not null default '',
  desc_ua      text not null default '',
  trailer_en   text not null default '',
  trailer_ua   text not null default '',
  poster_path  text not null default '',
  aleks        text not null default '' check (aleks in ('', 'yes', 'no')),
  alina        text not null default '' check (alina in ('', 'yes', 'no')),
  watched      boolean not null default false,
  watched_at   timestamptz,
  match_state  text not null default '',
  created_at   timestamptz not null default now(),
  created_by   text default public.member_name()
);

create unique index if not exists films_tmdb_unique
  on public.films (media_type, tmdb_id) where tmdb_id is not null;

alter table public.films enable row level security;

drop policy if exists "members read films"   on public.films;
drop policy if exists "members add films"    on public.films;
drop policy if exists "members change films" on public.films;
drop policy if exists "members delete films" on public.films;
create policy "members read films"   on public.films for select to authenticated using (public.is_member());
create policy "members add films"    on public.films for insert to authenticated with check (public.is_member());
create policy "members change films" on public.films for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members delete films" on public.films for delete to authenticated using (public.is_member());

-- TMDB lookups and the key: run supabase/tmdb-proxy.sql after this file.

-- Live updates between your two devices.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'films'
  ) then
    alter publication supabase_realtime add table public.films;
  end if;
end $$;

-- Film carried over from the first version. The site matches it on TMDB on first load.
insert into public.films (name_en, name_ua, year, runtime, genres, desc_en, desc_ua, created_by)
select '2 Fast 2 Furious', 'Подвійний форсаж', 2003, 107, '{Action,Crime,Thriller}',
       'Former cop Brian O''Conner teams up with his childhood friend Roman Pearce to take down a Miami drug lord by going undercover as street racers.',
       'Колишній поліцейський Браян О''Коннер об''єднується з другом дитинства Роменом Пірсом, щоб під виглядом вуличних гонщиків зупинити маямського наркобарона.',
       'Aleks'
where not exists (select 1 from public.films where name_en = '2 Fast 2 Furious');
