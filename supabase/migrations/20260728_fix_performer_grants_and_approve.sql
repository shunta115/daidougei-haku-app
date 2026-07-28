-- β検索: performer discovery for fans
-- Run entirely in Supabase SQL Editor

-- 1) Privileges (tables created via SQL often miss these)
grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant select, update on public.profiles to authenticated;

grant select on public.performers to anon, authenticated;
grant select, insert, update on public.performers to authenticated;

grant select on public.live_sessions to anon, authenticated;
grant select, insert, update on public.live_sessions to authenticated;

grant select, insert, delete on public.follows to authenticated;
grant select on public.follows to anon;

grant select, insert, update on public.tips to authenticated;
grant select on public.tips to anon;

grant select, insert, update on public.notifications to authenticated;

grant select, insert on public.admin_audit to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_role() to anon, authenticated;
grant execute on function public.get_admin_metrics() to authenticated;

-- 2) Readable policy for approved performers (no profiles join)
drop policy if exists performers_public_read on public.performers;

create policy performers_public_read on public.performers
  for select using (
    is_approved = true
    or id = auth.uid()
    or public.is_admin()
  );

-- 3) Force-approve existing test performers + activate profiles
update public.performers
set is_approved = true
where stage_name ilike '%test%performer%'
   or stage_name ilike '%Test Performer%';

update public.profiles p
set status = 'active'
from public.performers perf
where perf.id = p.id
  and perf.is_approved = true
  and p.status in ('pending', 'active');

-- 4) Verification (you should see rows here)
select
  p.id,
  p.stage_name,
  p.is_approved,
  p.genre,
  pr.email,
  pr.role,
  pr.status
from public.performers p
join public.profiles pr on pr.id = p.id
order by p.created_at desc;
