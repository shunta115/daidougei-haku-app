# PR #103: revised security, deletion and TEST approval plan

This is a reviewable preparation, **not authorization to execute anything remotely**. No TEST/production migration, fixture INSERT, existing-data deletion, Stripe/LIVE setting changes, merge or production deployment is performed by this revision. Keep HOME_ENABLED=false. The previous TEST audit snapshot is the basis; recheck drift immediately before any later approved apply.

## Permission and concurrency corrections

The TEST snapshot had no service_role UPDATE privilege on any performers column, no service_role SELECT on admin_members, and no active office users. Earlier PGlite tests granted parent UPDATE and therefore missed the first mismatch; the fixtures now reproduce the restricted role and tests assert it stays restricted.

- `haku_home_private.asset_locks` owns per-performer row locks. INSERT ON CONFLICT then FOR UPDATE serializes first-use as well as later uploads, replacement, reorder and main selection. No UPDATE grant, trigger replacement or row change is made to performers.
- Only `SELECT(user_id,permission,status)` on existing admin_members is added for service_role. No profile/member write, email/name read, browser grant, membership or role changes. `api/ops/_guard.ts` is unchanged: verified Supabase session, active admin profile, existing allowlist OR active admin/super_admin member; production allowlist precondition remains unchanged. Disabling a member continues to deny membership-based access; an explicitly allowlisted bootstrap principal retains the pre-existing exception.
- Notifications now target active admin profiles that also have active office membership. An allowlist-only administrator can still authenticate under the unchanged rule, but must have active membership to be a notification recipient. No recipient means the whole booking transaction fails. Notices contain no requester contact fields.
- All nine public home RPCs are SECURITY INVOKER, empty search_path, EXECUTE revoked from PUBLIC/anon/authenticated and granted only to service_role. Browser access to new tables is read-own-only for public profile/media metadata; no client mutations. All new private tables have RLS enabled and no browser schema usage. The two private trigger functions are SECURITY DEFINER solely to clean feature data when legacy deletion callers have no feature privileges; they use qualified names, empty search_path, and no direct EXECUTE grants to browser/service roles.

## Account deletion and Storage consistency

Audited legacy path: `api/ops/_hakuAdmin.ts` users/soft-delete sets profiles.status=deleted, then clears performer approval/LIVE/name and revokes sessions. It does not call auth.admin.deleteUser. Existing financial and LIVE code is unchanged.

- Logical deletion: a new feature-only AFTER UPDATE OF status trigger removes official-home metadata/assets/locks for that user when status becomes deleted. Public and owner file APIs also require active profile status. Other performer data and other users' media are not changed. Previously deleted/suspended records are not backfilled or removed by applying this migration.
- Physical deletion: new homepage/media/lock FKs are ON DELETE CASCADE. Booking performer_id is nullable ON DELETE SET NULL. The booking payload never stores a duplicate performer_id. Requester details are independent and stay office-private until their own expiry/legal review. Audit actor FK is ON DELETE SET NULL. New FKs do not obstruct legacy profile→performer cascades; legacy FKs outside this feature may have their own restrictions.
- Every media-row deletion (normal delete, replacement, logical-delete trigger or FK cascade) transactionally queues the two exact private object paths. SQL never deletes storage.objects or existing buckets. The server uses the Storage API, restricted to the new bucket and UUID-generated paths; failed removal or acknowledgment stays retryable after its 5-minute lease. Metadata disappears before physical file removal, preventing continued serving even during a Storage outage.
- A retired path's hash is a tombstone: no new asset can reuse that path, including after cleanup. An acknowledged queue item clears raw path/performer UUID. This prevents a delayed cleanup worker from deleting a new upload at the same path. Tombstone hashes are access-restricted pseudonymous operational data, not a promise of legal anonymization.
- Normal owner actions opportunistically drain that owner's queue. Deleted accounts cannot authenticate; a super_admin processes their pending objects via the office cleanup operation. No cron or scheduler was enabled. Production activation is gated on assigning an operator to run daily maintenance and verify queues reach zero. Snapshot/backup copies and visitor-downloaded public files cannot be erased by this queue.

## Requester personal information policy (operational defaults, not statutory periods)

| Category | Policy / implementation |
|---|---|
| Initial inquiry | Erase input payload at 180 days from receipt. Status edits do not extend this deadline. |
| Declined | Earlier of the original deadline or 90 days after moving to declined. |
| Quote / booked | Automatic statutory-review hold, review due in 30 days. A super_admin must classify required transaction records before releasing the hold. A status reversal never silently releases it. |
| Statutory record or dispute | Explicit hold with reason category, no free-text PII in the audit, review due in 30 days. Overdue review is prominently counted and NEVER automatically interpreted as permission to delete. |
| Verified erasure request | Super_admin-only explicit confirm; refuse while held. First resolve/document any preservation obligation, then erase. |
| After erasure | payload={}, performer_id=NULL, anonymized timestamp; ordinary API cannot restore/update erased cases. Only minimized case ID/status/timestamps remain. This is deletion of direct identifiers, not an assertion of irreversible legal anonymity. |
| Audit / minimized cases | Actor/action/case ID/time only; no copied payload, email, IP or search string. Office access/status/privacy/retention operations are audited. Retention maintenance removes audit older than one year except unresolved holds, and erased case shells one year after erasure. |
| Rate limiting | Salted IP hash, one-hour active window; up to 100 expired entries are pruned on each accepted attempt. Raw IP never saved. No requests means expired hashes can remain until a separately approved cleanup; no indefinite contact payload is stored there. |

Ordinary admins can list/search/change case status and inspect maintenance counts. Only principals that pass unchanged requireAdmin AND requireSuperAdmin may erase, manage holds, execute retention or delete queued files. All APIs return no-store; requester details never appear in public endpoints, push text, search URLs, logs or metadata.

Legal classification: the Personal Information Protection Commission explains that APPI does not specify one universal retention period and unnecessary personal data should be erased without delay. These 180/90/365-day defaults are HAKU's proposed operating policy, not a claim of legal compliance by duration alone. Source: https://www.ppc.go.jp/all_faq_index/faq1-q5-2/ (checked 2026-10-31).

The National Tax Agency describes corporate books/transaction documents as generally subject to seven-year retention from the specified tax-return deadline, with ten-year cases such as certain loss years. That does **not** make every initial inquiry a seven-year record. A quote/order/contract or related electronic communication can itself be a required record; the quoting/booked hold protects it until the office/accounting/legal reviewer classifies it. Source: https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5930.htm (checked 2026-10-31).

Legally required records must be preserved in the office's approved accounting/contract record system with the correct original/electronic-record requirements, access controls and actual applicable retention deadline. This feature is not an electronic books preservation system and does not change Stripe/payment records. A super_admin's hold-release confirmation attests that the record was preserved there or no preservation duty remains. No external record export/provider has been created. Review the policy and processing notice before production activation; backups also require an approved retention and restore/re-erasure procedure.

## Safe TEST-only office preparation — not executed

`node scripts/prepare-home-test-office.mjs` is an offline dry run. It does not read credentials, connect or write anything. Tests exercise its refusal paths.

Only after new explicit approval:
1. Reconfirm project name/ref is `haku-merch-validation` / `aeqskxxykzapgaudbeqa`; check SQL hashes and empty conflicting names again. Confirm no fixtures are production copies.
2. Supply credentials privately to the operator process, never chat/shell arguments/source control. The optional --execute path requires exact TEST URL, a service JWT whose ref/role match TEST, `HAKU_TEST_PERSISTENT_APPROVAL=PR103:aeqskxxykzapgaudbeqa`, non-production environment and a new *.local credential output path. It rejects opaque keys because their project binding cannot be verified by this script.
3. --execute creates only one NEW random `pr103-office-<UUID>@example.invalid` Auth identity, confirmed without sending mail. A newly reserved 0600 local file receives the password and a **separately reviewed promotion SQL**, not stdout. No existing profile/member is altered by the script; service profile/member write privileges remain unchanged.
4. The generated SQL must itself receive approval and be run as DB owner in TEST. It requires that exact fresh Auth UUID/email, server-controlled fixture/project markers, creation in the last 15 minutes, matching fresh fan profile, and no existing member. It promotes only that new identity to ordinary admin and inserts its membership. Unexpected or partial state aborts; no automatic rollback deletes any existing account. A partial NEW fixture is reported by UUID for separate reviewed cleanup.
5. A super_admin fixture, if needed for retention E2E, requires a separately reviewed TEST-only promotion; default provisioning does not create one. Do not edit existing account roles or any production record. Preserve the existing allowlist and member checks.
6. Configure only separately approved TEST branch application settings; leave Stripe/LIVE values unchanged. Run real TEST upload/privacy/cleanup tests only after approval. Never reuse production user credentials/data.

## Re-audit and release limits

No default ACL changes. No GRANT UPDATE on performers; no public member reads. New bucket remains private, 2MiB cap, JPEG/PDF MIME allowlist. Audited existing Storage policies cover only avatars/merch. Permission tests mimic service role without old-table UPDATE and without membership table-wide read. Verify actual hosted ACL/RLS/Storage again after a later approved apply; local tests are not a remote migration success.

This un-applied migration was edited in place because the read-only audit confirmed version 20261030213928 and all its objects were absent from TEST. If any other environment has applied an earlier version, STOP and use a separately reviewed forward migration; do not overwrite migration history or rerun this file.

## Final local evidence

79 test files / 488 tests passed. Application and API/maintenance TypeScript passed; Vite build passed (existing large-chunk warning remains). Local WebKit full flow: 16 checks. Fresh Unix-socket PostgreSQL 17 cluster: five concurrency/column-privilege checks passed. Restricted-role PGlite DB re-audit: 17 checks passed. Initial parallel startup timeouts were resolved by a bounded initialization timeout and a final serial full run; no functional failure is hidden as a pass.

The revised nine function names, two trigger names, relations/schema and bucket were rechecked READ ONLY in the specified TEST project: no conflicts, migration absent. Current old-table restrictions remain unchanged remotely, as expected before apply. This does not claim hosted Storage/auth success.

Migration SHA-256: `4401704ddaa3e11217916145ae8068b3fd7841b0f5cd38cadc1d12cbcb2b053a`. Full JSON evidence: `docs/validation/official-home-revision.json`; SQL hashes: `docs/validation/official-home-sql-sha256.txt`.
