-- Safe alternative to 20260728_fix_performer_grants_and_approve.sql.
-- Grants runtime privileges and refreshes public performer read policy.
-- Does not approve performers and does not change user/profile data.

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

drop policy if exists performers_public_read on public.performers;
create policy performers_public_read on public.performers
  for select using (
    is_approved = true
    or id = auth.uid()
    or public.is_admin()
  );
