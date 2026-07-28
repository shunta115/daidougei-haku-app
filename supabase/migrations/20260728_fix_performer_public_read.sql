-- Fix: fans could not see approved performers because performers_public_read
-- joined profiles, and profiles RLS blocks reading other users' rows.

drop policy if exists performers_public_read on public.performers;

create policy performers_public_read on public.performers
  for select using (
    is_approved = true
    or id = auth.uid()
    or public.is_admin()
  );

-- Ensure already-approved performers are active (safe no-op if already active)
update public.profiles p
set status = 'active'
from public.performers perf
where perf.id = p.id
  and perf.is_approved = true
  and p.status = 'pending';
