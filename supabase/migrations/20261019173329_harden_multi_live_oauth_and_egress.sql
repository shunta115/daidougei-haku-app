alter table public.multi_live_destinations
  add column if not exists egress_lease_token uuid,
  add column if not exists egress_lease_expires_at timestamptz,
  add column if not exists egress_stop_requested boolean not null default false,
  add column if not exists youtube_broadcast_id text,
  add column if not exists actual_visibility text
    check (actual_visibility is null or actual_visibility in ('public', 'unlisted', 'private')),
  add column if not exists visibility_confirmed_at timestamptz;

create table if not exists public.multi_live_oauth_sessions (
  state_hash text primary key check (char_length(state_hash) = 64),
  performer_id uuid not null references public.performers(id) on delete cascade,
  browser_binding_hash text not null check (char_length(browser_binding_hash) = 64),
  completion_hash text unique check (completion_hash is null or char_length(completion_hash) = 64),
  encrypted_oauth text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  authorized_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.multi_live_oauth_sessions is
  'Server-only, one-use OAuth state and encrypted pending credential bound to an authenticated performer and HttpOnly browser session.';

alter table public.multi_live_oauth_sessions enable row level security;
alter table public.multi_live_oauth_sessions force row level security;
revoke all on table public.multi_live_oauth_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.multi_live_oauth_sessions to service_role;

create index if not exists multi_live_oauth_sessions_expiry_idx
  on public.multi_live_oauth_sessions (expires_at);

create or replace function public.acquire_multi_live_egress_lease(
  p_performer_id uuid,
  p_lease_token uuid,
  p_ttl_seconds integer default 90
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid lease ttl';
  end if;

  update public.multi_live_destinations
     set egress_lease_token = p_lease_token,
         egress_lease_expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
         egress_stop_requested = false,
         status = 'starting',
         last_error_code = null,
         updated_at = clock_timestamp()
   where performer_id = p_performer_id
     and provider = 'youtube'
     and egress_id is null
     and (
       egress_lease_token is null
       or egress_lease_expires_at is null
       or egress_lease_expires_at < clock_timestamp()
     );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.acquire_multi_live_egress_lease(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.acquire_multi_live_egress_lease(uuid, uuid, integer) to service_role;

create or replace function public.consume_multi_live_oauth_session(
  p_state_hash text,
  p_browser_binding_hash text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid;
begin
  update public.multi_live_oauth_sessions
     set consumed_at = clock_timestamp()
   where state_hash = p_state_hash
     and browser_binding_hash = p_browser_binding_hash
     and consumed_at is null
     and expires_at > clock_timestamp()
  returning performer_id into owner_id;
  return owner_id;
end;
$$;

revoke all on function public.consume_multi_live_oauth_session(text, text) from public, anon, authenticated;
grant execute on function public.consume_multi_live_oauth_session(text, text) to service_role;

create or replace function public.complete_multi_live_oauth_session(
  p_completion_hash text,
  p_performer_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  pending_oauth text;
  affected integer;
begin
  update public.multi_live_oauth_sessions
     set completed_at = clock_timestamp()
   where completion_hash = p_completion_hash
     and performer_id = p_performer_id
     and completed_at is null
     and authorized_at is not null
     and expires_at > clock_timestamp()
  returning encrypted_oauth into pending_oauth;

  if pending_oauth is null then
    return false;
  end if;

  update public.multi_live_destinations
     set encrypted_oauth = pending_oauth,
         youtube_broadcast_id = null,
         actual_visibility = null,
         visibility_confirmed_at = null,
         updated_at = clock_timestamp()
   where performer_id = p_performer_id
     and provider = 'youtube';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'destination missing during OAuth completion';
  end if;
  return true;
end;
$$;

revoke all on function public.complete_multi_live_oauth_session(text, uuid) from public, anon, authenticated;
grant execute on function public.complete_multi_live_oauth_session(text, uuid) to service_role;
