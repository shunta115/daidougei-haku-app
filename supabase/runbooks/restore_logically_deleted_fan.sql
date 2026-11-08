\set ON_ERROR_STOP on
-- Operator-only runbook. Defaults to a rollback rehearsal.
\if :{?commit_recovery}
\else
  \set commit_recovery false
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

create temporary table recovery_input on commit drop as
select :'target_uuid'::uuid as target_id,
       :'verified_email'::text as verified_email,
       :'expected_updated_at'::timestamptz as expected_updated_at,
       btrim(:'approved_display_name') as display_name,
       :'actor_uuid'::uuid as actor_id,
       btrim(:'approval_reference') as approval_reference;

do $$
declare
  request record;
  target public.profiles%rowtype;
  auth_account auth.users%rowtype;
  has_retirement boolean;
  restored_at timestamptz;
begin
  select * into strict request from pg_temp.recovery_input;
  if current_user <> 'postgres'
    or request.actor_id = request.target_id
    or char_length(request.display_name) not between 1 and 120
    or char_length(request.approval_reference) not between 1 and 160
    or not exists (
      select 1 from public.profiles p join public.admin_members m on m.user_id = p.id
      where p.id = request.actor_id and p.role = 'admin' and p.status = 'active'
        and m.status = 'active' and m.permission = 'super_admin'
    ) then
    raise exception 'Recovery requires a DBA, an active super-admin approver and an approval reference';
  end if;

  select * into target from public.profiles where id = request.target_id for update;
  if not found or target.role <> 'fan' or target.status <> 'deleted'
    or target.display_name is distinct from 'Deleted'
    or target.updated_at is distinct from request.expected_updated_at
    or target.email is distinct from request.verified_email then
    raise exception 'Profile differs from the reviewed recovery target';
  end if;

  select * into auth_account from auth.users where id = request.target_id for share;
  if not found or auth_account.email is distinct from request.verified_email
    or auth_account.email_confirmed_at is null or auth_account.deleted_at is not null
    or auth_account.banned_until > clock_timestamp() then
    raise exception 'Auth account does not meet recovery conditions';
  end if;

  if exists (select 1 from public.performers where id = request.target_id) then
    raise exception 'Existing performer requires separate review';
  end if;
  if to_regclass('public.account_retirements') is not null then
    execute 'select exists(select 1 from public.account_retirements where original_auth_user_id = $1)'
      into has_retirement using request.target_id;
    if has_retirement then raise exception 'Account retirement requires separate review'; end if;
  end if;

  update public.profiles
    set status = 'active', display_name = request.display_name
    where id = request.target_id
    returning updated_at into strict restored_at;

  insert into public.admin_audit(admin_id, action, target_id, meta)
  values (request.actor_id, 'user.recover_logical_delete', request.target_id,
    jsonb_build_object('approval_reference', request.approval_reference,
      'previous_status', 'deleted', 'previous_display_name', target.display_name,
      'previous_updated_at', target.updated_at, 'restored_updated_at', restored_at));
end;
$$;

select p.id, p.role, p.status, p.updated_at, a.id as audit_id
from pg_temp.recovery_input i
join public.profiles p on p.id = i.target_id
join lateral (
  select id from public.admin_audit
  where target_id = p.id and admin_id = i.actor_id and action = 'user.recover_logical_delete'
    and meta->>'approval_reference' = i.approval_reference
  order by created_at desc limit 1
) a on true;

\if :commit_recovery
  commit;
\else
  rollback;
\endif
