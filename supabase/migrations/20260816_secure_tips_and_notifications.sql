-- Lock down tips updates and notification inserts.
-- Stripe webhooks/confirm continue to use the service role (bypasses RLS).

drop policy if exists tips_admin_update on public.tips;
create policy tips_admin_update on public.tips
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_insert_system on public.notifications;
create policy notifications_insert_admin on public.notifications
  for insert with check (public.is_admin());

-- Follow → notify performer (no client insert).
create or replace function public.trg_notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  values (
    new.performer_id,
    'New follower',
    'Someone started following you.',
    '/#profile/' || new.fan_id::text
  );
  return new;
end;
$$;

drop trigger if exists follows_notify_performer on public.follows;
create trigger follows_notify_performer
  after insert on public.follows
  for each row execute procedure public.trg_notify_new_follower();

-- Admin approve → notify performer.
create or replace function public.trg_notify_performer_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_approved is true and coalesce(old.is_approved, false) is false then
    insert into public.notifications (user_id, title, body)
    values (
      new.id,
      'Approved',
      'Your performer profile is now public.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists performers_notify_approved on public.performers;
create trigger performers_notify_approved
  after update of is_approved on public.performers
  for each row execute procedure public.trg_notify_performer_approved();

-- Live start: only the hosting performer may notify their followers.
create or replace function public.notify_followers_live_start(
  p_performer_id uuid,
  p_stage_name text,
  p_title text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text;
begin
  if auth.uid() is null or auth.uid() <> p_performer_id then
    raise exception 'not allowed';
  end if;

  if p_title is not null and btrim(p_title) <> '' then
    body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー')
      || ' が「' || btrim(p_title) || '」を配信開始しました';
  else
    body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー')
      || ' がライブ配信を開始しました';
  end if;

  insert into public.notifications (user_id, title, body, link)
  select distinct f.fan_id, 'LIVE開始', body_text, 'live:' || p_performer_id::text
  from public.follows f
  where f.performer_id = p_performer_id;
end;
$$;

revoke all on function public.notify_followers_live_start(uuid, text, text) from public;
grant execute on function public.notify_followers_live_start(uuid, text, text) to authenticated;
