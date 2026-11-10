\set ON_ERROR_STOP on
\if :{?commit_recovery}
\else
  \set commit_recovery false
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
set local search_path = pg_catalog, pg_temp;

create temporary table performer_recovery_input on commit drop as
select :'target_uuid'::uuid as target_id,
       :'verified_email'::text as verified_email,
       :'expected_updated_at'::timestamptz as expected_updated_at,
       btrim(:'expected_display_name') as display_name,
       :'actor_uuid'::uuid as actor_id,
       btrim(:'profile_recovery_reference') as profile_recovery_reference,
       btrim(:'approval_reference') as approval_reference;

do $$
declare
  request record;
  target public.profiles%rowtype;
  prior_audit_id public.admin_audit.id%type;
  promoted_at timestamptz;
begin
  select * into strict request from pg_temp.performer_recovery_input;
  if current_user <> 'postgres' or request.actor_id = request.target_id
    or char_length(request.display_name) not between 1 and 120
    or btrim(request.verified_email) = ''
    or char_length(request.profile_recovery_reference) not between 1 and 160
    or char_length(request.approval_reference) not between 1 and 160
    or request.approval_reference = request.profile_recovery_reference then
    raise exception 'Performer recovery requires a DBA and a separate approval reference';
  end if;

  perform 1 from public.profiles p
  join public.admin_members m on m.user_id = p.id
  join auth.users u on u.id = p.id
  where p.id = request.actor_id and p.role = 'admin' and p.status = 'active'
    and m.permission = 'super_admin' and m.status = 'active'
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= clock_timestamp())
  for share of p, m, u;
  if not found then raise exception 'An active super-admin approver is required'; end if;

  select * into target from public.profiles where id = request.target_id for update;
  if not found or target.role is distinct from 'fan' or target.status is distinct from 'active'
    or target.updated_at is distinct from request.expected_updated_at
    or target.display_name is distinct from request.display_name
    or target.email is distinct from request.verified_email then
    raise exception 'Profile differs from the reviewed active fan account';
  end if;

  perform 1 from auth.users
  where id = target.id and email = request.verified_email and email_confirmed_at is not null
    and deleted_at is null and is_anonymous is false
    and (banned_until is null or banned_until <= clock_timestamp())
  for share;
  if not found then raise exception 'Auth account does not meet recovery conditions'; end if;

  if exists (select 1 from auth.users where id <> target.id and lower(btrim(email)) = lower(btrim(target.email)))
    or exists (select 1 from public.profiles where id <> target.id and lower(btrim(email)) = lower(btrim(target.email))) then
    raise exception 'Another account uses the verified email';
  end if;

  select id into strict prior_audit_id from public.admin_audit
  where target_id = target.id and action = 'user.recover_logical_delete'
    and meta->>'previous_status' = 'deleted'
    and meta->>'approval_reference' = request.profile_recovery_reference;

  if exists (select 1 from public.admin_audit where meta->>'approval_reference' = request.approval_reference) then
    raise exception 'This approval reference is already recorded';
  end if;

  if exists (
    select 1 from public.performers where id = target.id or lower(btrim(stage_name)) = lower(request.display_name)
  ) then
    raise exception 'An existing performer record requires separate review';
  end if;

  if exists (
    select 1 from public.account_retirements r where r.original_auth_user_id = target.id
      or r.email_sha256 in (encode(sha256(convert_to(target.email, 'UTF8')), 'hex'),
        encode(sha256(convert_to(lower(btrim(target.email)), 'UTF8')), 'hex'))
  ) then
    raise exception 'Account retirement requires separate review';
  end if;

  -- These records can outlive a performer row or retain its original UUID.
  if exists (
    select 1 from public.admin_audit where target_id = target.id and action like 'performer.%'
    union all select 1 from public.tips where original_performer_id = target.id
    union all select 1 from public.live_tip_events where original_performer_id = target.id
    union all select 1 from public.merch_orders where original_seller_id = target.id
    union all select 1 from public.merch_products where original_seller_id = target.id
    union all select 1 from public.performer_payouts where original_performer_id = target.id
    union all select 1 from public.payment_beneficiary_dispositions where original_performer_id = target.id
    union all select 1 from public.event_device_ballots where original_performer_id = target.id
    union all select 1 from public.event_device_ballots_backup_20261011_daily where performer_id = target.id
    union all select 1 from public.product_events where performer_id = target.id
  ) then
    raise exception 'Historical performer evidence requires separate review';
  end if;

  -- A concurrent insert must fail on the primary key and roll back the whole transaction.
  insert into public.performers (id, stage_name, review_status, is_approved, is_live, share_location,
    is_private_test, stripe_account_id, stripe_onboarding_complete)
  values (target.id, request.display_name, 'pending', false, false, false, false, null, false);

  update public.profiles set role = 'performer' where id = target.id returning updated_at into strict promoted_at;

  insert into public.admin_audit (admin_id, action, target_id, meta)
  values (request.actor_id, 'performer.recover_access', target.id,
    jsonb_build_object('approval_reference', request.approval_reference,
      'profile_recovery_audit_id', prior_audit_id, 'previous_role', target.role,
      'previous_updated_at', target.updated_at, 'restored_updated_at', promoted_at,
      'review_status', 'pending'));
end;
$$;

select p.id, p.role, p.status, p.updated_at, f.review_status, f.is_approved, a.id as audit_id
from pg_temp.performer_recovery_input i
join public.profiles p on p.id = i.target_id
join public.performers f on f.id = p.id
join public.admin_audit a on a.target_id = p.id and a.admin_id = i.actor_id
  and a.action = 'performer.recover_access' and a.meta->>'approval_reference' = i.approval_reference;

\if :commit_recovery
  commit;
\else
  rollback;
\endif
