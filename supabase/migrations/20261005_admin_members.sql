begin;

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  email text not null,
  permission text not null default 'admin' check (permission in ('super_admin', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  invited_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz null
);

create unique index if not exists admin_members_email_lower_unique
  on public.admin_members (lower(email));

alter table public.admin_members enable row level security;
alter table public.admin_members force row level security;

revoke all on table public.admin_members from anon, authenticated;

-- Preserve every existing active administrator as a super administrator.
-- This only inserts missing ledger rows; it does not rewrite profiles or Auth users.
insert into public.admin_members (user_id, name, email, permission, status)
select p.id,
       coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1), '管理者'),
       p.email,
       'super_admin',
       'active'
from public.profiles p
where p.role = 'admin'
  and p.status = 'active'
  and p.email is not null
on conflict (user_id) do nothing;

commit;
