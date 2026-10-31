# HAKU SMART PUSH: first release candidate

This branch is preparation only. No production schema changes, production flags,
merge, real Push, SNS posts or paid services are authorized by this draft.
The supplied directive ends mid-sentence in section 12. Its remaining approval
conditions are still needed. Issues #118/#119 require separate approval for DB,
merge, deployment and actual sends. PR117's approval applied only to its one test.

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
subscription are required. Queue claim and pre-send checks both recheck consent,
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
the launch budget. A processing/failed delivery is never reclaimed. Every attempt
consumes quota, including an uncertain result. A crash may lose a notification;
at-most-once attempts are intentional. 404/410 disable only the failed subscription.

## Cost and stop conditions

No new serverless function or cron. Existing heartbeat dispatch: max 5 sends per
request, max 500 queued recipients/event, max 500 attempts globally/UTC day. Empty
repeated enqueue returns its existing event without scanning followers again.
These are safety bounds, not a promise of zero infrastructure charges. Existing
plan consumption must be reviewed before activation; do not upgrade a plan.

Flags, all OFF unless separately approved:
- VITE_ENABLE_SMART_PUSH (preview/client UI)
- ENABLE_SMART_PUSH (private rehearsal and master runtime)
- ENABLE_LIVE_START_WEB_PUSH (LIVE sending)

VAPID values are reused and never logged or copied into documentation. Test
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

No real-device success is claimed for these new modes. PR117 proved the existing
one-device transport only. Remaining acceptance: TEST Supabase API/RLS integration,
real concurrent Postgres connections, WebKit/Android device flows, host disconnect
and permission revocation, notification taps when logged out/ended, and measured
request/DB usage. Startup under severe local CPU load may require a longer PGlite
boot timeout; do not hide functional failures behind timeout changes.

Release only reviewed commits. Apply the new migration to isolated TEST first,
run advisors, verify old clients and false flags, then request production approval.
Rollback: all three flags OFF and redeploy the same approved source. Preserve
queue records, consent and subscriptions; never reset uncertain deliveries.
