# One-account logical-delete recovery

This operator runbook requires separate approval for a production write. The SQL is a manual DBA procedure. It is not a migration, web endpoint, or batch job. Use the customer's existing UUID and the verified existing email. Do not put customer identifiers or email in the PR, CI logs, shell history, or source control.

## Preflight

- Identify exactly one matching profile and Auth record by UUID. Compare their email exactly against the operator-verified email. Capture the profile's current `updated_at` and confirm `role = fan`, `status = deleted`, and `display_name = Deleted`.
- Confirm email ownership was verified, the Auth identity still exists, there is no current ban or Auth deletion, and there is no performer row or account-retirement record. Review any prior audit entries. Auth signup metadata is a display-name clue, not proof of the latest public name. Use the display name explicitly approved for restoration.
- Record before-state counts and relevant row identifiers for tips, follows, reservations, orders, votes, account-retirement history, payout/Connect links, and any original-ID mappings. Compare results privately after the transaction. Record the approved ticket/reference and active super-admin UUID. Pause any concurrent manual operation on this account.
- Confirm the matching PR's three migrations and API are available before asking the account holder to apply. Verify the effective PostgREST hook and use the existing login after refresh. A recovery approval covers only the profile restoration. The user requests performer registration separately, and the office approves it through its normal review.

## SQL and audit

Open an authorized `psql` session as the project's `postgres` DBA. Set the six parameters privately in the session using psql variables `target_uuid`, `verified_email`, `expected_updated_at`, `approved_display_name`, `actor_uuid`, and `approval_reference`. Keep `commit_recovery` unset or false for rehearsal. Run `\i supabase/runbooks/restore_logically_deleted_fan.sql` from the repository root.

The script checks the operator, locks the exact profile and Auth rows, validates the expected identity and status, then changes only the profile status and display name. The profile update trigger maintains its timestamp. The transaction adds one `user.recover_logical_delete` audit event with the actor, approval reference, and original/restored timestamps. The email is compared inside the database and excluded from the audit event and result. A rehearsal rolls both writes back. It prints a provisional audit ID that must not be used as evidence of a committed operation.

After reviewing the rehearsal result and receiving the separate production recovery approval, repeat the read-only preflight. Set `commit_recovery` true and run the same script once. Use a new read-only transaction to confirm the expected UUID, email match, active fan profile, unchanged Auth status/identity, absence of a new performer record, unchanged linked rows, and the committed audit ID. Then the account holder can refresh, use the existing login and apply via `/live/register`.

## Recovery rollback

The default rehearsal ends with SQL `ROLLBACK`. Any error aborts the transaction. After a committed recovery, a compensating write needs its own approval. Before any performer application or subsequent profile change, lock the same profile and verify its current timestamp matches `restored_updated_at` in the committed recovery audit, the UUID/email still match, its status is active and role is fan, and no performer or retirement row exists. In that transaction restore `status = deleted` and the audited `previous_display_name`, then append a rollback audit event referencing the recovery audit ID and approval. Compare the preserved rows again. Retain both audit records. If any condition has changed or the member has started using the account, stop and review a targeted recovery plan.

The disposable Supabase integration test invokes the same SQL with synthetic users and asserts refusal for a wrong email, rollback by default, an audited recovery, refusal on replay, unchanged Auth row, and application and approval with the already-issued session. Production remains subject to physical Safari and the existing release approvals.
