-- Our Cinema — phone notifications. Run after features.sql. Safe to run more than once.
-- When one of you adds or deletes a title, the database calls the "notify" edge function
-- (supabase/functions/notify), which sends a push to the other person's devices.
-- Votes, ratings and «Переглянуто» only show up as messages on the site, not on the phone.
-- Needs three rows in public.app_secrets: hook_secret (any long random string), vapid_public and
-- vapid_private (a VAPID key pair; the public half also goes into config.js as vapidPublicKey).

create extension if not exists pg_net;

create or replace function public.films_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  actor  text;
begin
  actor := coalesce(public.member_name(), case when tg_op = 'DELETE' then null else new.updated_by end);
  if actor is null then return null; end if;
  select value into secret from public.app_secrets where key = 'hook_secret';
  if secret is null then return null; end if;
  perform net.http_post(
    url := 'https://yzkqhbueyqrtttjkvrhw.supabase.co/functions/v1/notify',
    body := jsonb_build_object(
      'type', tg_op,
      'actor', actor,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) - 'desc_en' - 'desc_ua' - 'tv_info' - 'providers' end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) - 'desc_en' - 'desc_ua' - 'tv_info' - 'providers' end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret),
    timeout_milliseconds := 5000);
  return null;
end;
$$;
revoke all on function public.films_notify() from public, anon, authenticated;

create or replace trigger films_notify after insert or delete on public.films
  for each row execute function public.films_notify();
