# HAKU SMART PUSH: first release candidate

This branch is preparation only. The continuation directive has been received.
Production DB, merge, Production deployment/configuration and actual device sends
require separate approvals under sections 19–23. PR117's one-device approval is
not reused. Production backup success must be verified before any DB application.

## Existing assets and separation

PR99 remains unmerged. Its LIVE-only queue structure is reused with changes:
45-second wait, live server-side publisher-track checks, default OFF broadcaster
intent, fresh eligibility checks, no recovery/retry of processing/failed rows,
recipient quotas and a fixed daily launch budget. Its unrelated UI/player code
is not imported. PR91 is unmerged but its day-of in-app client/migration already
exist on main; do not apply it again or describe it as Push.

Existing appearance delivery tables require an appearance FK. A dedicated LIVE
queue is therefore necessary; this is the same queue proposed in PR99, not a
second parallel LIVE system. Appearance processing and financial logic stay intact.

## Modes

With VITE_ENABLE_SMART_PUSH enabled, camera preparation uses a separate private
LiveKit room. The token endpoint only grants that room to the authenticated owner
with an active approved performer account and ENABLE_SMART_PUSH enabled.

- Test: owner-only rehearsal; no public LIVE session, no public is_live update,
  no location publication, no reservations or notifications. Invited test viewers
  are not offered in this first release; no one else receives a room grant.
- Public, no notifications: existing public LIVE path; follower intent defaults OFF.
- Public, notify: performer explicitly chooses it. Server records intent after
  start; initial enqueue and existing host heartbeats drive bounded dispatch.
  Cancelling intent stops pending deliveries. Already delivered notifications
  cannot be withdrawn. An old session cannot be newly armed after 30 seconds.

No specific performer, show date or event is hardcoded.

## Eligibility and duplicate safety

Approval, active account, public non-test ongoing LIVE, a real unmuted publisher
video track, follow, independent LIVE consent, master permission and active Push
subscription are required. Only HTTPS Apple Push and Google FCM endpoints are accepted; arbitrary/internal URLs are suppressed. Queue claim and pre-send checks both recheck consent,
unfollow, public state and session end. If LiveKit inspection fails or the host
has no active video, the event is cancelled rather than recovered later.

The event waits 45 seconds and expires in five minutes. Provider TTL is 60 seconds.
Quiet-hour LIVE notifications are discarded, never delayed until next morning.
Recipient timezone is captured on explicit settings save. Default hours 09–21,
daily limit 2, weekly limit 8, same performer once per local day. Users can lower
caps. Equal start/end hours mean all day. Weeks start Monday in recipient timezone.
Only one active subscription per recipient is selected for a given event.

Existing PK/unique constraints and row locks protect enqueue/claim. Recipient
preference locks serialize competing performers; a global advisory lock protects
the launch budget. A processing/failed/unknown delivery is never reclaimed. Every attempt
consumes quota, including an uncertain result. Interrupted processing becomes unknown after two minutes; it is never resent. Known uncontacted rows can be released if the master switch pauses a batch. A crash may lose a notification;
at-most-once attempts are intentional. 404/410 disable only the failed subscription.

## Cost and stop conditions

No new serverless function or cron. Existing heartbeat dispatch: max 5 sends per
request, max 500 enrolled recipients and 500 attempts globally/UTC day. Audience discovery uses stable pages of 100, and each client pump continues at most 10 five-recipient batches. Overlapping pumps are suppressed; the existing heartbeat resumes remaining untouched rows. Empty
repeated enqueue returns its existing event without scanning followers again.
These are safety bounds, not a promise of zero infrastructure charges. Existing
plan consumption must be reviewed before activation; do not upgrade a plan.

Production flags remain OFF unless separately approved:
- VITE_ENABLE_SMART_PUSH (preview/client UI)
- ENABLE_SMART_PUSH (private rehearsal and master runtime)
- ENABLE_LIVE_START_WEB_PUSH (LIVE sending)

Production VAPID values are unchanged. A separate TEST-only pair is scoped to this preview branch; private keys are never included in the repository or user-facing logs. Test
subscriptions/providers are fake. No Stripe or Connect configuration changes.

## Other requested categories and explicit remaining gates

shared/notificationCatalog.ts defines all 12 requested category identifiers.
It does not emit events or imply completion. This first candidate implements
LIVE start and preserves existing appearance publication/change behavior.
Remaining producers/dispatch integration: reserved LIVE 10-minute reminder,
previous-day appearance reminder, reserved LIVE change/cancellation, performer
preflight, reservation milestones, activity encouragement, support receipt,
payout important alerts and operations important alerts. Follower identity alerts
are deliberately held OFF. Payment notification work must consume validated
existing payment results without changing settlement or Connect code.

The limits above currently govern the new LIVE queue. Before enabling multiple
normal categories, the existing appearance queue and future reservation queue
must share atomic global recipient quotas; do not claim multi-category caps are
already complete. Reservation quotas need their own bounded allowance.

The database master switch smart_push_control.enabled defaults OFF and is
rechecked before each send; stopping it does not require a redeploy. The runs
table records aggregate claimed/accepted/failed/unknown/suppressed counts and
elapsed milliseconds without recipient identities. VAPID 401/403 and repeated
unknown outcomes pause the sender automatically.

The real TEST Auth/REST/RPC integration has passed (see TEST-RESULTS.md). The TEST
DB already has guarded lifecycle RPCs from another experiment. A strictly
TEST-URL/preview-flag gated adapter uses those existing RPCs without changing the
production LIVE lifecycle or merging that PR. The preview build verifies its
client URL, Auth key, existing service credential and paused master inside Vercel;
only a success marker is logged. No credential values are printed.

No real-device success is claimed for these new modes. PR117 proved the existing
one-device transport only. Remaining acceptance: Vercel protected HTTP route with the user’s normal login, WebKit/Android device flows, host disconnect
and permission revocation, notification taps when logged out/ended, and measured
request/DB usage. Startup under severe local CPU load may require a longer PGlite
boot timeout; do not hide functional failures behind timeout changes.

Release only reviewed commits. Apply the new migration to isolated TEST first,
run advisors, verify old clients and false flags, then request production approval.
Rollback: all three flags OFF and redeploy the same approved source. Preserve
queue records, consent and subscriptions; never reset uncertain deliveries.
