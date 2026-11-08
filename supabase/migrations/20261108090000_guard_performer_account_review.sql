begin;

-- The API validates cockpit membership before invoking this server-only RPC.
create or replace function public.manage_performer_account(
  p_actor_id uuid, p_user_id uuid, p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  next_status public.account_status;
begin
  if auth.role() is distinct from 'service_role'
     or p_actor_id is null or p_user_id is null or p_actor_id = p_user_id
     or not exists (
       select 1 from public.profiles
       where id = p_actor_id and role = 'admin' and status = 'active'
     ) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  if p_action = 'approve' then
    if target.status not in ('active', 'pending') then
      raise exception 'account unavailable' using errcode = 'P0001';
    end if;
    -- Serialize against a concurrent GoTrue ban or deletion while approving.
    perform 1 from auth.users
    where id = p_user_id and deleted_at is null
      and (banned_until is null or banned_until <= now())
    for share;
    if not found then
      raise exception 'account unavailable' using errcode = 'P0001';
    end if;

    update public.performers set is_approved = true, review_status = 'approved',
      reviewed_at = now(), reviewed_by = p_actor_id, rejection_reason = null
    where id = p_user_id;
    if not found then
      raise exception 'performer not found' using errcode = 'P0002';
    end if;
    update public.profiles set status = 'active'
    where id = p_user_id and status = 'pending';
    insert into public.admin_audit(admin_id, action, target_id, meta)
      values (p_actor_id, 'performer.approve', p_user_id, '{}'::jsonb);
  elsif p_action in ('suspend', 'soft-delete') then
    if target.role = 'admin' then
      raise exception 'use administrator management' using errcode = 'P0001';
    end if;

    -- A retry can never downgrade a logical deletion to suspension.
    next_status := case when target.status = 'deleted' or p_action = 'soft-delete'
      then 'deleted'::public.account_status else 'suspended'::public.account_status end;
    update public.profiles set status = next_status,
      display_name = case when next_status = 'deleted' then 'Deleted' else display_name end
    where id = p_user_id;
    update public.performers set is_live = false, is_approved = false, share_location = false,
      stage_name = case when next_status = 'deleted' then 'Deleted' else stage_name end
    where id = p_user_id;
    if target.status is distinct from next_status then
      insert into public.admin_audit(admin_id, action, target_id, meta)
        values (p_actor_id, case when next_status = 'deleted' then 'user.soft_delete' else 'user.suspend' end,
          p_user_id, '{}'::jsonb);
    end if;
  else
    raise exception 'invalid action' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.manage_performer_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.manage_performer_account(uuid, uuid, text) to service_role;

-- Reject stale clients that still attempt approval through the Data API.
create or replace function public.require_account_review_rpc()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role')
     and new.is_approved and not old.is_approved then
    raise exception 'approval requires the management API' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger require_account_review_rpc before update of is_approved on public.performers
  for each row execute function public.require_account_review_rpc();

create or replace function public.prevent_restricted_performer_reactivation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role')
     and old.role <> 'admin' and old.status in ('suspended', 'deleted')
     and new.status in ('active', 'pending') then
    raise exception 'account recovery requires a separate operation' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger prevent_restricted_performer_reactivation before update of status on public.profiles
  for each row execute function public.prevent_restricted_performer_reactivation();

commit;
