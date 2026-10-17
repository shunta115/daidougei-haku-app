# Stripe Connect production release runbook

This runbook is deliberately split into independently reversible gates. Never
deploy the application before the database gate has passed, and never mutate a
connected account merely because a consistency audit reports it as unmatched.

## 1. Production preflight (read only)

Run and save the result before the maintenance window:

```sql
select to_regprocedure(
  'public.sync_performer_stripe_connect(uuid,text,boolean)'
) as existing_function;

select id, stripe_account_id, stripe_onboarding_complete, updated_at
from public.performers
where stripe_account_id is not null
order by id;

select stripe_account_id, count(*)
from public.performers
where stripe_account_id is not null
group by stripe_account_id
having count(*) > 1;

select count(*) as tips, coalesce(sum(coalesce(gross_amount_yen, amount_cents, 0)), 0) as tip_gross_yen
from public.tips;
select count(*) as payouts, coalesce(sum(amount_yen), 0) as payout_yen
from public.performer_payouts;
select count(*) as votes from public.event_votes;
```

Record the latest completed backup and do not continue if it predates the
release window by more than one daily-backup cycle. Database backups do not
restore deleted Storage objects; export or separately protect required Storage
objects before the migration.

## 2. Database migration

Apply only
`supabase/migrations/20261016134735_grant_service_role_performer_updates.sql`.
It is `CREATE OR REPLACE`, fixes `search_path`, locks the performer row, permits
only filling an empty Stripe ID or reusing the same ID, and grants execution
only to `service_role`.

Postflight:

```sql
select
  has_function_privilege('public', 'public.sync_performer_stripe_connect(uuid,text,boolean)', 'execute') as public_execute,
  has_function_privilege('anon', 'public.sync_performer_stripe_connect(uuid,text,boolean)', 'execute') as anon_execute,
  has_function_privilege('authenticated', 'public.sync_performer_stripe_connect(uuid,text,boolean)', 'execute') as authenticated_execute,
  has_function_privilege('service_role', 'public.sync_performer_stripe_connect(uuid,text,boolean)', 'execute') as service_execute,
  pg_get_functiondef('public.sync_performer_stripe_connect(uuid,text,boolean)'::regprocedure) as definition;
```

Expected privileges are `false, false, false, true`. Re-run the read-only
baseline and confirm that no performer, tip, payout, or vote row changed.

Rollback preserves all data:

```sql
begin;
revoke all on function public.sync_performer_stripe_connect(uuid,text,boolean)
  from public, anon, authenticated, service_role;
drop function public.sync_performer_stripe_connect(uuid,text,boolean);
commit;
```

Rollback the application first. Do not drop the function while the new
application is still serving requests. If the migration fails, its transaction
must be rolled back and the application must not be deployed.

## 3. Stripe and Vercel settings

Validation endpoint (test mode only):

- URL: `https://daidougei-haku-app-git-codex-issue-df36f5-daidougei-s-projects.vercel.app/api/stripe/webhook`
- delivery scope: events on Connected accounts (`connect=true`)
- subscribed event: `account.updated`
- store the returned signing secret as Preview-only
  `STRIPE_CONNECT_WEBHOOK_SECRET`
- redeploy only the PR Preview and verify `/api/stripe/readiness` reports test
  mode and Supabase project `aeqskxxykzapgaudbeqa`

Production must use a distinct live-mode connected-account endpoint and a
Production-only signing secret. Existing platform endpoints and their secrets
remain unchanged. Test and live signing secrets must never be copied between
environments.

## 4. Release, monitoring, and rollback

After database postflight, deploy the reviewed commit without merging first if
the release process supports an immutable production deployment. Monitor for at
least 30 minutes:

- Connect start/status HTTP status and stage (never secret values)
- Stripe endpoint delivery failures and signature failures
- `stripe_webhook_events` counts by `status`, `source`, and `livemode`
- stale `processing` rows older than five minutes
- account replacement guard errors
- checkout, refund, transfer, and payout error rates

Rollback order: route production to the previous immutable deployment; leave
the additive RPC in place; confirm checkout and webhook health; then investigate.
Do not revert by deleting financial rows, replacing Stripe IDs, issuing refunds,
or changing transfers. The RPC can be removed later using the SQL above only
after all callers have been rolled back.

## 5. Restore drill

Restore the latest production backup to a new isolated project, never over the
source. Reconfigure Auth URLs and secrets with non-production values; separately
copy only the Storage objects needed for integrity sampling; deploy Edge
Functions from source. Compare counts and checksums for `event_votes`, `tips`,
`performer_payouts`, `performers`, and `account_retirements`. Do not enable email,
payments, webhooks, or scheduled jobs in the isolated project. Delete the drill
project only under a separately approved cleanup action.
