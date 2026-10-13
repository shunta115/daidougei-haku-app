-- Additive fan calendar features for performer appearances.
-- No background job is enabled by this migration. Reminder delivery remains OFF.

create table if not exists public.appearance_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  appearance_id uuid not null references public.performer_appearances(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, appearance_id)
);

alter table public.appearance_favorites enable row level security;
drop policy if exists appearance_favorites_own_read on public.appearance_favorites;
create policy appearance_favorites_own_read on public.appearance_favorites
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists appearance_favorites_own_insert on public.appearance_favorites;
create policy appearance_favorites_own_insert on public.appearance_favorites
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.performer_appearances a
      where a.id = appearance_id
        and (a.status = 'published' or (a.status in ('cancelled','postponed') and a.published_at is not null))
    )
  );
drop policy if exists appearance_favorites_own_delete on public.appearance_favorites;
create policy appearance_favorites_own_delete on public.appearance_favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.appearance_favorites to authenticated;

create table if not exists public.appearance_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  appearance_id uuid not null references public.performer_appearances(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes in (0, 30, 60, 1440)),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','cancelled','sent','failed')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, appearance_id, offset_minutes)
);

create index if not exists appearance_reminders_pending_idx
  on public.appearance_reminders (scheduled_for)
  where status = 'pending' and enabled;

alter table public.appearance_reminders enable row level security;
drop policy if exists appearance_reminders_own_read on public.appearance_reminders;
create policy appearance_reminders_own_read on public.appearance_reminders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists appearance_reminders_own_insert on public.appearance_reminders;
create policy appearance_reminders_own_insert on public.appearance_reminders
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists appearance_reminders_own_update on public.appearance_reminders;
drop policy if exists appearance_reminders_own_delete on public.appearance_reminders;
create policy appearance_reminders_own_delete on public.appearance_reminders
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke update on public.appearance_reminders from authenticated;
grant select, insert, delete on public.appearance_reminders to authenticated;

create or replace function public.prepare_appearance_reminder()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_starts_at timestamptz;
  v_status text;
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'not allowed';
  end if;
  select starts_at, status into v_starts_at, v_status
  from public.performer_appearances where id = new.appearance_id;
  if v_starts_at is null or v_status <> 'published' then
    raise exception 'appearance unavailable';
  end if;
  new.scheduled_for := v_starts_at - make_interval(mins => new.offset_minutes);
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then new.status := 'pending'; end if;
  return new;
end;
$$;

revoke all on function public.prepare_appearance_reminder() from public, anon, authenticated;
drop trigger if exists appearance_reminders_prepare on public.appearance_reminders;
create trigger appearance_reminders_prepare
  before insert
  on public.appearance_reminders
  for each row execute function public.prepare_appearance_reminder();

create or replace function public.sync_appearance_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'published' then
    update public.appearance_reminders
      set enabled = false, status = case when status = 'sent' then status else 'cancelled' end, updated_at = clock_timestamp()
      where appearance_id = new.id and status <> 'sent';
  elsif new.starts_at is distinct from old.starts_at or old.status is distinct from 'published' then
    update public.appearance_reminders
      set scheduled_for = new.starts_at - make_interval(mins => offset_minutes),
          enabled = true,
          status = case when status = 'sent' then status else 'pending' end,
          updated_at = clock_timestamp()
      where appearance_id = new.id and status <> 'sent';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_appearance_reminders() from public, anon, authenticated;
drop trigger if exists performer_appearances_sync_reminders on public.performer_appearances;
create trigger performer_appearances_sync_reminders
  after update of starts_at, status on public.performer_appearances
  for each row execute function public.sync_appearance_reminders();

create table if not exists public.appearance_performers (
  appearance_id uuid not null references public.performer_appearances(id) on delete cascade,
  performer_id uuid not null references public.performers(id) on delete restrict,
  invitation_status text not null default 'pending' check (invitation_status in ('pending','accepted','declined','cancelled')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (appearance_id, performer_id)
);

alter table public.appearance_performers enable row level security;
drop policy if exists appearance_performers_read on public.appearance_performers;
create policy appearance_performers_read on public.appearance_performers
  for select using (
    performer_id = (select auth.uid())
    or exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.performer_id = (select auth.uid()))
    or (
      invitation_status = 'accepted'
      and exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.status = 'published')
    )
    or public.is_admin()
  );
drop policy if exists appearance_performers_owner_insert on public.appearance_performers;
create policy appearance_performers_owner_insert on public.appearance_performers
  for insert to authenticated with check (
    exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.performer_id = (select auth.uid()))
    or public.is_admin()
  );
drop policy if exists appearance_performers_owner_delete on public.appearance_performers;
create policy appearance_performers_owner_delete on public.appearance_performers
  for delete to authenticated using (
    exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.performer_id = (select auth.uid()))
    or public.is_admin()
  );
drop policy if exists appearance_performers_participant_update on public.appearance_performers;
create policy appearance_performers_participant_update on public.appearance_performers
  for update to authenticated using (
    performer_id = (select auth.uid())
    or exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.performer_id = (select auth.uid()))
    or public.is_admin()
  ) with check (
    performer_id = (select auth.uid())
    or exists (select 1 from public.performer_appearances a where a.id = appearance_id and a.performer_id = (select auth.uid()))
    or public.is_admin()
  );

grant select on public.appearance_performers to anon, authenticated;
grant insert, update, delete on public.appearance_performers to authenticated;

create or replace function public.validate_appearance_participant_update()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.appearance_id is distinct from old.appearance_id or new.performer_id is distinct from old.performer_id then
    raise exception 'participant identity cannot change';
  end if;
  if public.is_admin() then return new; end if;
  select performer_id into v_owner from public.performer_appearances where id = old.appearance_id;
  if (select auth.uid()) = old.performer_id then
    if new.display_order is distinct from old.display_order or new.invitation_status not in ('accepted','declined') then
      raise exception 'participant may only accept or decline';
    end if;
    return new;
  end if;
  if (select auth.uid()) = v_owner then
    if new.invitation_status not in ('pending','cancelled') then
      raise exception 'owner cannot accept an invitation for a participant';
    end if;
    return new;
  end if;
  raise exception 'not allowed';
end;
$$;

revoke all on function public.validate_appearance_participant_update() from public, anon, authenticated;
drop trigger if exists appearance_performers_validate_update on public.appearance_performers;
create trigger appearance_performers_validate_update
  before update on public.appearance_performers
  for each row execute function public.validate_appearance_participant_update();
