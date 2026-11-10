# Performer access after a profile recovery

This procedure is for one verified account whose logical deletion was already reversed and whose current profile is `fan / active`. [PR #124](https://github.com/shunta115/daidougei-haku-app/pull/124) adds the ordinary same-account application flow. This manual follow-up uses the existing performer review schema and can be reviewed and executed independently of that release.

## Read-only preflight

1. Privately match the previous `user.recover_logical_delete` audit and its approval reference to the exact Auth UUID, profile and operator-verified email. Confirm the email is unique across Auth and profiles, confirmed in Auth, and the account is neither anonymous, deleted nor under an active ban. Record the current profile `updated_at` and exact approved display name.
2. Look for existing performer rows by UUID and all known names and historical IDs. Check approval audits, retirement records by original UUID and email digest, original-ID mappings, and payment/Connect, tip, follow, reservation, event, order and activity rows. Record identifiers and counts privately. If a performer row or evidence of a prior performer is found, stop and review how to retain the original row, review state, payout links and history. If a historical ID is unresolved, verify it from historical evidence in isolation before approving a new pending row. Fan activity can remain linked to the same profile.
3. Verify the production project, current schema and approval/visibility policies. Confirm a current recoverable backup and record the backup reference. Prepare a new account-specific approval reference and an active super-admin approver. Keep UUIDs, email, and operator records out of source control and shared logs. Coordinate any concurrent manual operation on the account before the write.

## Approved operation

Use a fresh `psql -X` DBA session as `postgres`. Set `target_uuid`, `verified_email`, `expected_updated_at`, `expected_display_name`, `actor_uuid`, `profile_recovery_reference` and the new `approval_reference` privately. Run `\i supabase/runbooks/restore_performer_access.sql` from the repository root. The default is `ROLLBACK` for a rehearsal in a disposable TEST database. Rehearsal output is provisional. Keep production preflight read-only and set `commit_recovery` to `true` only for the individually approved production execution.

The transaction locks and rechecks the reviewed profile and Auth identity. It creates one performer with the same UUID and stage name, `review_status = pending`, and approval, LIVE and location sharing off. The existing profile changes only in `role` and the trigger-maintained `updated_at`. The transaction adds one `performer.recover_access` audit that links to the previous recovery. Auth, the existing session and linked records are preserved. The performer owner can edit their profile after refreshing the existing login. Publication is handled by a separate office review.

## Verify and handle a reversal

Use a new read-only transaction to confirm the same UUID and Auth identity, `performer / active`, one pending performer with the approved name, and one committed audit entry. Compare the reviewed profile fields, prior audit and linked records. Confirm anonymous access excludes the pending performer and the owner's refreshed session can reach the performer setup screen.

A failure before commit rolls back all writes. If a committed operation needs reversal, record the current row state, audit reference and any activity created since commit. A separate approval and a targeted reversal plan are required, particularly once profile editing, review, or other account activity has begun. Retain both audit records for any approved reversal.

## Disposable PostgreSQL rehearsal

Create an empty local PostgreSQL 17 database named `haku_performer_recovery_test`. Run the integration test with its URL, using synthetic identities and the same operator script.

```sh
HAKU_RECOVERY_TEST_DB_URL=postgresql://postgres@127.0.0.1:55417/haku_performer_recovery_test \
  node tests/sql/performer-access-recovery.mjs
```

The test uses the repository's base schema and role guards with a small fixture for production-specific history columns and the public performer policy. It exercises the `psql` entry point, verifies rollback and concurrency, compares preserved rows, and checks visibility and owner editing with database roles and a synthetic Auth claim.
