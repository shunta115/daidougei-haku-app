# Existing fan → performer application (TEST review)

No production database changes, user deletion, production deployment, or Stripe operations are authorized by this change. The migration defines a function; it does not convert existing accounts.

## Cause and fix

`auth.admin.signOut(userId, 'global')` passed a UUID to an API that requires the target user's access JWT. This reproduces the invalid-number-of-segments failure. It occurred after profile/performer writes, so an error response did not imply that the operation had rolled back. Affected paths: user suspension, logical deletion, and administrator disabling.

The fix uses `auth.admin.updateUserById(id, { ban_duration: '876000h' })` rather than inventing or substituting JWTs. Admin reactivation removes the ban. Auth errors are checked before profile writes. Current profile status is checked on `requireAuthUser` operations, because already-issued JWTs can remain usable until expiry. No claim is made that all old access tokens are cryptographically revoked, or that every historical direct-to-DB policy checks suspension. Existing multi-step restriction operations are not a distributed transaction: a later DB failure can leave an Auth ban in place and requires operator reconciliation. The performer application itself is one DB transaction.

Bearer tokens must have JWT shape and must pass Supabase Auth verification. Administrator access still requires an active database admin profile plus configured identifiers or active admin membership. Editable `user_metadata` does not authorize admin operations. Administrator lifecycle actions cannot bypass the last-super-admin safeguards through the users panel.

“メールを確認” reveals the existing profile email in the guarded cockpit. It does not call `email_confirm` or bypass email ownership verification.

## Application and preservation

- Existing signed-in active fans open `/live/register` and explicitly apply. The server ignores any client-supplied target ID and uses the verified user's ID.
- An authorized administrator can select “パフォーマー登録へ切り替え” in Users.
- A server-only, security-invoker SQL function locks the profile, inserts a pending/unapproved performer only if missing, changes the profile role, and records the actor in one transaction.
- Auth user, email, password, session, and existing profile status are unchanged. Tips, follows, bookings, payments, and Connect fields are never updated by this operation. Existing performer records are never overwritten, including approval/rejection and Connect details.
- Repeated requests do not create a second account or reset performer details. Rejected existing applications are not silently resubmitted; use the existing office review process.
- Profile completion and office approval use the existing performer flow. No automatic approval or Stripe onboarding occurs. Performer navigation retains public discovery, follow, and support features. Existing performer-specific voting restrictions are not broadened by this security fix.

## Akira: operator procedure after release approval

1. Identify the exact existing account by verified email and record the Auth UUID. Check current profile status and previous audit entries. The old failed deletion/suspension may already have persisted changes.
2. If suspended/deleted or Auth-banned, stop. Obtain explicit approval for a reviewed recovery of that same UUID and original profile details. Do not create a replacement account or bypass status restrictions. This PR does not automatically restore users or unban Akira.
3. For an active account, Akira signs in with the existing email/password and opens `/live/register`, then selects the same-account application button. Alternatively, an authorized operator selects that account in Users and chooses the performer application action.
4. Confirm unchanged Auth UUID/email, an unapproved pending performer record, and preserved tip/follow/booking/payment records. Akira completes stage name, genre, bio, region, and photo.
5. The office reviews the application under the existing Applications screen and approves only after its normal checks. Existing Connect information is retained. Any Stripe-related action remains separately prohibited until explicitly authorized.
6. Confirm the existing login continues and public fan features remain usable; confirm the performer profile is visible only after approval.

## Verification and release gates

Run `npm run typecheck`, `npx vitest run`, and `npm run build`. Server files are additionally typechecked explicitly because the application tsconfig excludes API files.

Run `tests/sql/account-transition.sql` only against a fresh disposable PostgreSQL TEST database. The fixture creates test roles/tables, simulates service-role JWT claims, executes the real migration, and checks identity/session/history/Connect preservation, pending review, retry behavior, permission grants, and transactional rollback. It is not a full Supabase Auth/RLS integration test. The dedicated GitHub Actions job provisions PostgreSQL 17; the existing HAKU quality gate handles application tests/build.

Run `node tests/transition-e2e/run.mjs` after installing Playwright WebKit. Optionally set `HAKU_WEBKIT_EXECUTABLE`. It launches localhost Vite with fictitious Supabase configuration and mocks or blocks every nonlocal request. It checks the actual registration entry in iPhone 13 WebKit emulation, the session bearer, absence of signup/logout, unchanged local session identity, refresh into performer setup, and mobile overflow. It is not physical iPhone Safari or real Supabase Auth verification.

Before production: review/approve the PR and SQL migration; pass CI; validate Auth, role/RLS policies, existing ledger relationships, admin suspension/reactivation, and performer approval against a designated isolated Supabase TEST project; check physical iPhone Safari; approve production migration/deployment separately. Approve any necessary Akira account recovery separately. No production rollout is performed by this task.
