-- Our Cinema — only member emails can get an account, so sign-in links
-- can't be sent to anyone else. Replace the two placeholder emails, run this,
-- then in Supabase: Authentication → Auth Hooks → Add hook → Before User Created
-- → Postgres → public.hook_before_user_created.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  em text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if em in ('aleks@example.com', 'alina@example.com') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This list is private.'));
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
