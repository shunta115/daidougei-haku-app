begin;
-- Only the trusted server may call this transaction, after verifying the actor.
create or replace function public.apply_fan_performer(p_user_id uuid, p_actor_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare target public.profiles%rowtype;
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null or p_user_id is null then
    raise exception 'server only' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found or target.status <> 'active' or target.role not in ('fan', 'performer') then
    raise exception 'active fan account required';
  end if;
  if p_actor_id <> p_user_id and not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin' and status = 'active'
  ) then raise exception 'admin required' using errcode = '42501'; end if;
  -- Preserve every existing performer field, including Connect and approval.
  insert into public.performers (id, stage_name, is_approved, is_live, review_status)
  values (target.id, coalesce(nullif(target.display_name, ''), 'パフォーマー'), false, false, 'pending')
  on conflict (id) do nothing;
  if target.role = 'fan' then
    update public.profiles set role = 'performer' where id = target.id;
    insert into public.admin_audit(admin_id, action, target_id, meta)
    values (p_actor_id, 'performer.application', target.id, jsonb_build_object('source', 'existing_fan', 'self_service', p_actor_id = p_user_id));
  end if;
end;
$$;
revoke all on function public.apply_fan_performer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_fan_performer(uuid, uuid) to service_role;
commit;
