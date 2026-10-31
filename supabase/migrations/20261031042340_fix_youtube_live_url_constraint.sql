-- Review-only repair: PostgreSQL standard_conforming_strings preserves backslashes.
-- Bracket expressions avoid the over-escaping in the original migration.
-- No row data, existing RLS policies, payment fields, or DIRECT LIVE state is changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.performers
  drop constraint if exists performers_youtube_live_url_check,
  add constraint performers_youtube_live_url_check
    check (youtube_live_url is null or youtube_live_url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$');

-- Existing navigator RLS permits delegated DIRECT LIVE updates. YouTube settings
-- are owner-only even when that broader policy permits updating the row.
create or replace function public.protect_youtube_live_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> old.id then
    raise exception 'YouTube LIVE settings are owner-only.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_youtube_live_owner() from public, anon, authenticated;
drop trigger if exists performers_youtube_live_owner on public.performers;
create trigger performers_youtube_live_owner
before update on public.performers
for each row when (
  old.youtube_live_url is distinct from new.youtube_live_url
  or old.youtube_live_video_id is distinct from new.youtube_live_video_id
  or old.youtube_live_enabled is distinct from new.youtube_live_enabled
)
execute function public.protect_youtube_live_owner();
commit;
