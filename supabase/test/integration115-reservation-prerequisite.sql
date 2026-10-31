-- TEST bootstrap only: missing dependency of the already shipped reservation migration.
-- Derived from the existing navigator schema and Production's read-only function definition.
-- Refuses an existing table; do not apply to Production or overwrite existing delegation.
begin;
do $$ begin if to_regclass('public.live_navigator_assignments') is not null or to_regprocedure('public.can_navigate_live(uuid)') is not null then raise exception 'Existing navigator dependency: review instead of overwriting'; end if; end $$;
create table public.live_navigator_assignments (
 navigator_id uuid not null references public.profiles(id) on delete cascade,
 performer_id uuid not null references public.performers(id) on delete cascade,
 active boolean not null default true, created_at timestamptz not null default now(),
 primary key(navigator_id,performer_id)
);
alter table public.live_navigator_assignments enable row level security;
revoke all on public.live_navigator_assignments from public,anon,authenticated;
grant select on public.live_navigator_assignments to authenticated;
grant all on public.live_navigator_assignments to service_role;
create policy navigator_read_self on public.live_navigator_assignments for select to authenticated
 using(navigator_id=(select auth.uid()) or public.is_admin());
create function public.can_navigate_live(target_performer_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.live_navigator_assignments a
 join public.profiles p on p.id=a.navigator_id join public.performers performer on performer.id=a.performer_id
 where a.navigator_id=auth.uid() and a.performer_id=target_performer_id and a.active
 and p.role='organizer' and p.status='active' and performer.is_approved);
$$;
revoke all on function public.can_navigate_live(uuid) from public;
-- Public reservation read policies call this predicate; no auth UID means false.
grant execute on function public.can_navigate_live(uuid) to anon,authenticated;
commit;
