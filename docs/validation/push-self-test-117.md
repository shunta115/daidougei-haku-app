# iPhone self-test release

Scope: PR #117 only. No payment, Connect, AWP, schema or existing notification scheduler changes.

Production configuration required after approval:
- ENABLE_SELF_PUSH_TEST=true
- SELF_PUSH_TEST_USER_ID=29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1
- SELF_PUSH_TEST_SUBSCRIPTION_ID=bd4b95f6-875a-40a6-aa44-e55ccd4893a9
- Existing WEB_PUSH_SUBJECT and VAPID key pair stay unchanged.

Owner confirmed the active Apple subscription belongs to their iPhone. The profile is a performer test account, so authorization uses the confirmed exact user ID rather than the admin role. Endpoint selection remains server-side and never accepts request targets.

Open HAKU with ?pushSelfTest=1, log in with that same account and open Notifications. The button sends one authenticated POST. The UI does not send on page load. API permission checks remain authoritative.

A single INSERT into existing platform_settings, key haku_self_push_test_20261101, claims the campaign before Apple is contacted. Its existing primary key prevents simultaneous or repeated requests, including requests after a timeout. Value contains status and timestamp only; no secrets or recipient identifiers. Never delete the claim to retry an uncertain delivery. A crash after claiming can yield zero deliveries; this deliberately prefers at most one attempt. No automatic retries. Provider acceptance is not proof of iPhone display.

Production changes after approval: merge reviewed PR, add the three scoped environment variables, Git main production deployment, invoke one self-test, retain claim and delivery audit. Disable the test flag after the attempt (requires a new production deployment to take effect). Existing functions, Stripe/Connect settings and AWP remain untouched.

Rollback: disable the flag and redeploy main, or revert only this PR. Preserve the claim. Do not rotate VAPID keys or delete subscriptions. A queued Apple notification cannot be recalled; TTL is 300 seconds.

TEST verification uses fake subscriptions, fake VAPID placeholders and a mocked provider; no real device or production writes. Test coverage includes authentication, allowlist, pinned single active subscription, Apple host, confirmation, arbitrary target rejection, disabled flag, concurrent calls, replay, database errors and ambiguous provider failure.
