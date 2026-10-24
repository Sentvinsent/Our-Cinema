-- Our Cinema — server-side TMDB lookups. Safe to run more than once.
-- The TMDB key lives in public.app_secrets, which no browser can read
-- (row-level security on, no policies, all grants revoked). Only the
-- public.tmdb() function below reads it, and only for the two members.

create extension if not exists http with schema extensions;

create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- One-time move from the old table the browser could read, then remove it.
do $$
begin
  if to_regclass('public.app_config') is not null then
    insert into public.app_secrets (key, value)
      select key, value from public.app_config where key = 'tmdb_key' and value <> ''
      on conflict (key) do update set value = excluded.value;
    if exists (select 1 from public.app_secrets where key = 'tmdb_key') then
      drop table public.app_config;
    end if;
  end if;
end $$;

-- To set or change the key later, run in the SQL editor:
--   insert into public.app_secrets (key, value) values ('tmdb_key', '<your key>')
--   on conflict (key) do update set value = excluded.value;

create or replace function public.tmdb(path text, params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  k     text;
  url   text;
  q     text := '';
  kv    record;
  resp  extensions.http_response;
  hdrs  extensions.http_header[] := array[extensions.http_header('accept', 'application/json')];
begin
  if not public.is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- search, details, and recommendations only
  if path !~ '^/(search/multi|(movie|tv)/[0-9]+(/recommendations)?)$' then
    raise exception 'path not allowed' using errcode = '22023';
  end if;

  select value into k from public.app_secrets where key = 'tmdb_key';
  if k is null or k = '' then
    raise exception 'tmdb key missing';
  end if;

  for kv in select * from jsonb_each_text(coalesce(params, '{}'::jsonb)) loop
    if kv.key in ('query', 'language', 'include_adult', 'append_to_response', 'include_video_language', 'page') then
      q := q || '&' || kv.key || '=' || extensions.urlencode(kv.value);
    end if;
  end loop;

  if k like 'eyJ%' then
    hdrs := hdrs || extensions.http_header('Authorization', 'Bearer ' || k);
    url := 'https://api.themoviedb.org/3' || path || '?' || substr(q, 2);
  else
    url := 'https://api.themoviedb.org/3' || path || '?api_key=' || extensions.urlencode(k) || q;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');
  select * into resp from extensions.http(('GET', url, hdrs, null, null)::extensions.http_request);
  if resp.status <> 200 then
    raise exception 'tmdb status %', resp.status;
  end if;
  return resp.content::jsonb;
end;
$$;

revoke all on function public.tmdb(text, jsonb) from public, anon;
grant execute on function public.tmdb(text, jsonb) to authenticated;
