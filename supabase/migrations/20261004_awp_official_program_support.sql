-- AWP 2026 official-program support.
-- Additive only: existing event slots, ballots, performers and venues are unchanged.

begin;
set local lock_timeout = '5s';

alter table public.event_slots
  add column if not exists performer_name_ja text,
  add column if not exists source_key text,
  add column if not exists source_label text;

comment on column public.event_slots.performer_name_ja is
  'Official printed performer name when no performer account is linked yet.';
comment on column public.event_slots.source_key is
  'Stable import key for an official source; used to make program imports idempotent.';
comment on column public.event_slots.source_label is
  'Human-readable provenance, for example AWP official program 2026.';

create unique index if not exists event_slots_event_source_key_uidx
  on public.event_slots (event_id, source_key)
  where source_key is not null;

create table if not exists public.event_guest_appearances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  official_name_ja text not null check (length(btrim(official_name_ja)) > 0),
  appearance_type text not null check (appearance_type in ('stage', 'statue', 'roving', 'statue_roving')),
  appearance_date date not null,
  linked_performer_id uuid references public.performers (id),
  source_key text not null,
  source_label text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, source_key)
);

comment on table public.event_guest_appearances is
  'Official event appearances, including not-yet-registered stage/statue/roving performers. This is separate from voting eligibility.';

alter table public.event_guest_appearances enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_guest_appearances'
      and policyname = 'event_guest_appearances_public_read'
  ) then
    create policy event_guest_appearances_public_read on public.event_guest_appearances
      for select using (
        exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.status in ('published', 'archived') or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_guest_appearances'
      and policyname = 'event_guest_appearances_admin_write'
  ) then
    create policy event_guest_appearances_admin_write on public.event_guest_appearances
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

grant select on public.event_guest_appearances to anon, authenticated;
grant insert, update on public.event_guest_appearances to authenticated;

commit;
