# PR #124 production gate

The production database has the performer review columns and service role access to profiles, performers, admin audit, and admin membership. The hosted TEST project lacks the review columns and the service role write privileges. Its service role also cannot read admin audit or admin membership. Neither environment had the application RPC installed at the time of inspection.

The hosted check stages the missing review columns, the reviewed RPCs and narrow privileges inside one rolled-back transaction. It uses synthetic Auth rows and simulated JWT claims. CI separately starts a disposable Supabase stack for GoTrue login, real JWT verification, PostgREST/RLS and the cockpit handler. Keep the hosted TEST project intact until a durable TEST schema and grant plan has been reviewed.

Approval locks the profile and the Auth row, rejects unavailable accounts and commits publication, pending-profile activation and audit together. Both admin screens use the same endpoint. The database rejects stale direct approval and ordinary-account reactivation writes from API roles.

For user suspension and logical deletion, the DB restriction, performer visibility and audit commit together before the Auth ban. If Auth fails, HTTP 503 with `auth_restriction_pending` instructs the operator to retry the same action. A retry can finish the ban and cannot downgrade a logical deletion. A DB failure occurs before the Auth call. This deliberately prioritizes the application-side restriction during a partial failure. Existing JWTs and unrelated direct Data API policies require separate review for immediate global revocation. The separate administrator membership enable/disable workflow keeps its existing behavior.

Before release, reconcile the hosted TEST environment, verify physical iPhone Safari, and approve the migrations and coordinated deployment. Install the new RPC and write guards before deploying its callers. The old approval endpoint will be blocked in the interval. Treat any recovery of Akira's exact existing account as a separately approved operation after read-only verification.
