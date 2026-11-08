# PR #124 production gate

The production database has the performer review columns and service role access to profiles, performers, admin audit, and admin membership. The hosted TEST project lacks the review columns and the service role write privileges. Its service role also cannot read admin audit or admin membership. Neither environment had the application RPC installed at the time of inspection.

The hosted check stages the missing review columns, the reviewed RPCs and narrow privileges inside one rolled-back transaction. It uses synthetic Auth rows and simulated JWT claims. CI separately starts a disposable Supabase stack for GoTrue login, real JWT verification, PostgREST/RLS and the cockpit handler. Keep the hosted TEST project intact until a durable TEST schema and grant plan has been reviewed.

Approval locks the profile and the Auth row, rejects unavailable accounts and commits publication, pending-profile activation and audit together. Both admin screens use the same endpoint. The database rejects stale direct approval and ordinary-account reactivation writes from API roles.

For user suspension and logical deletion, the DB restriction, performer visibility and audit commit together before the Auth ban. If Auth fails, HTTP 503 with `auth_restriction_pending` instructs the operator to retry the same action. A retry can finish the ban and cannot downgrade a logical deletion. A DB failure occurs before the Auth call. This deliberately prioritizes the application-side restriction during a partial failure. Existing JWTs and unrelated direct Data API policies require separate review for immediate global revocation. The separate administrator membership enable/disable workflow keeps its existing behavior.

Before release, reconcile the hosted TEST environment, verify physical iPhone Safari, and approve the migrations and coordinated deployment. Install the new RPC and write guards before deploying its callers. The old approval endpoint will be blocked in the interval. Treat any recovery of Akira's exact existing account as a separately approved operation after read-only verification.

## Data API and approved migration order

The final migration checks the current profile and Auth restriction on every authenticated PostgREST request, including requests using a previously issued JWT and RPC calls. Anonymous reads and service role calls still follow their existing grants and policies. Pending applicants retain access. The hook does not revoke tokens and does not run on Storage or Realtime. In-flight requests that passed the check before a restriction committed can finish. Release preflight must inspect the effective PostgREST pre-request configuration and must stop if an unrelated hook is configured.

For production review, verify the 20261003 review schema and service role grants first. Then apply these files in order:

1. `20261102023117_fan_performer_application.sql`
2. `20261108090000_guard_performer_account_review.sql`
3. `20261108091000_guard_restricted_data_api.sql`

Confirm PostgREST reloaded configuration and schema, then release the matching API and client. The second migration prevents old clients from writing approval directly, so coordinate the API deployment with that migration. For rollback of only the new request guard, reset `pgrst.db_pre_request` on `authenticator`, notify PostgREST to reload config, verify the hook is inactive, then drop its function and reload schema. Retain the approval guards during any API rollback unless a separately reviewed replacement prevents account reactivation.

## Hosted TEST change plan (unapplied)

Target only project `aeqskxxykzapgaudbeqa`. The verified SQL route is a transaction with a short lock timeout, temporary schema/grant changes, synthetic rows, assertions, and rollback. Use the disposable stack for the real Auth/PostgREST run. Its database and Auth fixtures are discarded by the CI cleanup. No hosted restore is needed for the completed rollback tests.

If a persistent hosted trial is required later, obtain separate approval and verify a restorable backup or isolated clone first. Stage the four review columns from the first ALTER TABLE in `20261003_admin_review_workflow.sql`, and provision only the grants used by the tested paths, subject to an ACL preflight:

```sql
grant update (role) on public.profiles to service_role;
grant insert (id, stage_name, is_approved, is_live, review_status)
  on public.performers to service_role;
grant update (is_approved, is_live, share_location, review_status, reviewed_at, reviewed_by, rejection_reason)
  on public.performers to service_role;
grant insert (admin_id, action, target_id, meta) on public.admin_audit to service_role;
grant select (user_id, permission, status) on public.admin_members to service_role;
grant select (id, performer_id, ended_at), update (ended_at, ended_reason)
  on public.live_sessions to service_role;
```

Verify `live_sessions.ended_reason` exists before the grant. Capture exact pre-existing ACLs and schema before planning reversal. The first two PR migrations add functions and write guards and the third changes the REST hook; they do not rewrite histories. Revert only the grants that were added, restore the previous hook, and remove the new triggers/functions if abandoning the trial. Drop newly added review columns only after exporting their contents and verifying no accepted TEST review data depends on them. Do not replay historical backfill or overwrite existing TEST rows. Managed-backup availability and restoration have not been verified for the hosted TEST project, so this is not an approved persistent change plan.
