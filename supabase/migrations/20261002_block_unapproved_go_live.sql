-- Block unapproved or inactive performers from entering LIVE state.
-- Additive only; does not rewrite existing rows or change approval UX.

begin;
set local lock_timeout = '5s';

create or replace function public.protect_unapproved_go_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_live is true and not public.is_admin() then
    if new.is_approved is not true then
      raise exception 'Unapproved performers cannot go live.'
        using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.profiles p
      where p.id = new.id
        and p.status = 'active'
    ) then
      raise exception 'Inactive performer accounts cannot go live.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists performers_protect_unapproved_go_live on public.performers;
create trigger performers_protect_unapproved_go_live
  before insert or update on public.performers
  for each row execute function public.protect_unapproved_go_live();

commit;
