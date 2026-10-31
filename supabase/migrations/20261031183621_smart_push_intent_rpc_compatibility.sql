-- Notification-only update compatible with guarded LIVE lifecycle schemas.
-- No LIVE publication, session lifecycle or payment fields are changed here.
begin;
create schema if not exists haku_push_private;
revoke all on schema haku_push_private from public,anon;
grant usage on schema haku_push_private to authenticated;
create or replace function haku_push_private.set_live_push_intent(p_session_id uuid,p_notify boolean)
returns void language plpgsql security definer set search_path='' as $$
declare s record; caller uuid:=auth.uid();
begin
  if caller is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select ls.* into s from public.live_sessions ls
    join public.performers p on p.id=ls.performer_id
    join public.profiles pr on pr.id=p.id
    where ls.id=p_session_id and ls.performer_id=caller and ls.ended_at is null
      and p.is_approved and pr.status::text='active'
    for update of ls;
  if not found then raise exception 'not_owner_or_ended' using errcode='42501'; end if;
  if p_notify and s.started_at<now()-interval '30 seconds' then raise exception 'intent_window_closed'; end if;
  update public.live_sessions set follower_push_requested=p_notify where id=s.id and performer_id=caller;
end; $$;
revoke all on function haku_push_private.set_live_push_intent(uuid,boolean) from public,anon;
grant execute on function haku_push_private.set_live_push_intent(uuid,boolean) to authenticated;
create or replace function public.set_live_push_intent(p_session_id uuid,p_notify boolean)
returns void language sql security invoker set search_path='' as $$ select haku_push_private.set_live_push_intent(p_session_id,p_notify) $$;
revoke all on function public.set_live_push_intent(uuid,boolean) from public,anon;
grant execute on function public.set_live_push_intent(uuid,boolean) to authenticated;

-- Performers receive aggregate counts through the existing server stats API.
-- They must not discover individual followers through direct REST queries.
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated
  using (fan_id=(select auth.uid()) or public.is_admin());
commit;
