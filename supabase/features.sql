-- Our Cinema — later features (where to watch, series progress, recommendations, notifications).
-- Run after setup.sql and tmdb-proxy.sql. Safe to run more than once.

-- ---------- films: extra columns ----------
alter table public.films
  add column if not exists providers  jsonb,        -- where to watch in Poland: {"sub":[{"n":name,"l":logo}], "paid":bool}
  add column if not exists tv_info    jsonb,        -- series only: {"status", "seasons":[{"s","e","d"}], "next":{"s","e","d"}}
  add column if not exists meta_at    timestamptz,  -- when providers / tv_info were last refreshed from TMDB
  add column if not exists next_s     smallint check (next_s >= 0),  -- series progress: next season to watch
  add column if not exists next_e     smallint check (next_e >= 1),  -- … and next episode (null = not watching)
  add column if not exists seen_s     smallint,     -- aired seasons when the series was marked watched
  add column if not exists updated_by text,
  add column if not exists updated_at timestamptz;

-- Who changed a row last (used for "Аліна проголосувала…" notifications).
create or replace function public.films_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce(public.member_name(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger films_stamp before insert or update on public.films
  for each row execute function public.films_stamp();

-- ---------- hidden recommendations (shared by both of you) ----------
create table if not exists public.rec_hidden (
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id    integer not null,
  hidden_by  text default public.member_name(),
  created_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);
alter table public.rec_hidden enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rec_hidden' and policyname = 'members read hidden') then
    create policy "members read hidden"   on public.rec_hidden for select to authenticated using (public.is_member());
    create policy "members add hidden"    on public.rec_hidden for insert to authenticated with check (public.is_member());
    create policy "members remove hidden" on public.rec_hidden for delete to authenticated using (public.is_member());
  end if;
end $$;

-- ---------- phone notifications: one row per browser that turned them on ----------
create table if not exists public.push_subs (
  endpoint   text primary key,
  member     text not null default public.member_name(),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subs' and policyname = 'own subs read') then
    create policy "own subs read"   on public.push_subs for select to authenticated using (member = public.member_name());
    create policy "own subs add"    on public.push_subs for insert to authenticated with check (member = public.member_name());
    create policy "own subs change" on public.push_subs for update to authenticated using (member = public.member_name()) with check (member = public.member_name());
    create policy "own subs remove" on public.push_subs for delete to authenticated using (member = public.member_name());
  end if;
end $$;

-- ---------- votes: each of you can change only your own Так/Ні ----------
create or replace function public.films_own_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare who text := public.member_name();
begin
  if who = 'Aleks' then new.alina := old.alina;
  elsif who = 'Alina' then new.aleks := old.aleks;
  end if;
  return new;
end;
$$;
create or replace trigger films_own_vote before update on public.films
  for each row execute function public.films_own_vote();

-- ---------- phone notifications follow each device's chosen language ----------
alter table public.push_subs add column if not exists lang text not null default 'uk' check (lang in ('uk', 'en'));
