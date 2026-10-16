begin;

create table if not exists public.event_official_navigators (
  event_id uuid not null references public.events(id) on delete cascade,
  event_date date not null,
  performer_id uuid not null references public.performers(id) on delete restrict,
  show_on_home boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, event_date)
);

alter table public.event_official_navigators enable row level security;
alter table public.event_official_navigators force row level security;

drop policy if exists event_official_navigators_public_read on public.event_official_navigators;
create policy event_official_navigators_public_read
  on public.event_official_navigators for select
  using (
    public.is_admin()
    or (
      show_on_home = true
      and exists (
        select 1 from public.events e
        where e.id = event_id and e.status = 'published'
      )
    )
  );

drop policy if exists event_official_navigators_admin_write on public.event_official_navigators;
create policy event_official_navigators_admin_write
  on public.event_official_navigators for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.event_official_navigators to anon, authenticated;
revoke insert, update, delete on public.event_official_navigators from anon;
grant insert, update, delete on public.event_official_navigators to authenticated;

commit;
