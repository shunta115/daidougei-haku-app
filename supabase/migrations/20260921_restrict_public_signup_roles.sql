-- Public signup may create fan or performer accounts only.
-- Existing organizer/admin accounts are unchanged; office roles must be assigned
-- through an authenticated operational process instead of user-controlled metadata.

begin;
set local lock_timeout = '5s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role;
begin
  begin
    chosen_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'fan');
  exception when invalid_text_representation then
    chosen_role := 'fan';
  end;

  if chosen_role not in ('fan', 'performer') then
    chosen_role := 'fan';
  end if;

  insert into public.profiles (id, role, status, display_name, email)
  values (
    new.id,
    chosen_role,
    case
      when chosen_role = 'performer' then 'pending'::public.account_status
      else 'active'::public.account_status
    end,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'User'),
    new.email
  );

  if chosen_role = 'performer' then
    insert into public.performers (id, stage_name, is_approved)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Performer'),
      false
    );
  end if;

  return new;
end;
$$;

commit;
