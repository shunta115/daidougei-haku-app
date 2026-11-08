# PR120 TEST verification — 2026-11-01 JST

## Scope and boundary

TEST: `aeqskxxykzapgaudbeqa` (haku-merch-validation).
Production: `pmmtijwswzwhuriqhlep` — read-only inspection only; no schema,
queues, configuration, LIVE, payments or subscriptions were changed there.

Before setup, TEST had 18 profiles, 13 sessions and zero subscriptions. Its
notification queue and intent RPC did not exist. Existing rows were not deleted.
Two runs used 12 new synthetic Auth identities under `example.invalid`; no emails
were sent. Passwords and TEST VAPID secrets are outside the repository in private
local files. Do not attach those files to a PR or publish them.

## Applied to TEST, never production

| File | SHA256 |
| --- | --- |
| 20261031181110_smart_push_live.sql | a96a6b291d8ac0a5bce861492ebe41f32bee1329775bae9eaf62954ba9646004 |
| 20261031183621_smart_push_intent_rpc_compatibility.sql | be4c59a68297a774581ebcc49bf5826498385b52143d53ce3c51e1c540f45d6b |
| 20261031183831_smart_push_runtime_controls.sql | 76b35a2c4c3eb280f186f4f678a6db5ca290fa75a911c3d92044b772cdd0a9ad |

Final pre-send revalidation: `20261031185419_smart_push_presend_revalidation.sql` is also TEST-applied. SHA256: `7a29aa5215b07a6f9dab6620dcedcd940bb03c27d558555c48cfc8ef21c45721`.
Production changes would add four private service-only tables, seven preference
columns, a session intent column, scoped functions and indexes; tighten the
follows read policy; and insert the disabled master control row. No monetary
columns, settlement logic, Connect or AWP operations are changed.

The TEST DB contains an existing guarded LIVE lifecycle from another experiment.
Its triggers correctly reject direct writes. The intent RPC was changed to an
owner-checked definer in a non-exposed schema with an invoker public wrapper.
The TEST-only UI adapter uses existing reserve/activate/finish RPCs; it is disabled
for the production URL and requires an explicit preview-only flag. That other PR
was not merged and its implementation was not copied.

## Real Auth / REST / RPC results

Passed with real Supabase credentials and network calls, no Push sender:

- Six QA identities authenticated through `/auth/v1/token` in each run.
- Own-user consent, follows and fake subscriptions saved through REST/RLS.
- A different user could not change the fan's consent.
- Performer REST reads could not discover follower account IDs after the policy fix.
- Anonymous, fan and performer roles could not read queue/control/run tables or
  execute service-only enqueue functions.
- Public notification OFF produced no queue; other-owner intent was rejected.
- Intent cancellation and end before the send window produced zero claims.
- The test waited 46 real seconds for the DB's 45-second window.
- Eight concurrent HTTP RPC requests for two performers granted only one recipient
  reservation under a daily cap of one. Replays granted zero more rights.
- Consent withdrawn independently of the shared subscription excluded that fan;
  appearance-only consent and non-followers were excluded.
- With the database master OFF, an otherwise eligible newly owned LIVE produced
  no event or reservation through the real API.

The TEST helper was in a private schema, required immutable Auth app metadata
plus own-session ownership, returned only aggregate counts, and contained no
provider call. Its authenticated execute grants were revoked after testing.
It is under scripts/qa and is not a production migration or application endpoint.

The temporary Vercel QA endpoint was removed. Protected Vercel HTTP integration
was not completed: a share-secret-in-URL method was rejected by automatic review.
No such URL request was performed. The temporary link was revoked. The user must
use normal Vercel login for browser/device checks. The preview build separately
probes the actual TEST Auth/service API with its existing credentials inside the
build environment; it prints a success marker only, never credentials.

## No claim of device delivery

Apple/FCM calls: **0**. No physical iPhone/Android notification or real camera/audio
integration is claimed for PR120. PR117's production one-device success is separate.
Mocked provider tests, real Supabase API tests and device receipt are distinct.

Final TEST state after synthetic flow: master OFF, zero active QA sessions and
zero active synthetic subscriptions. Fake subscriptions were disabled; session,
queue and audit evidence was retained. Two selected QA actors remain available
for human device preparation, while other synthetic profiles are suspended.
The receiving actor's LIVE consent was reset OFF for an explicit user choice.
The preview sender flag remains OFF, so permission/subscription preparation cannot
send any notification. Device credentials are only in a private local file.

Security advisors: new tables have intentional service-only RLS without browser
policies (four INFO findings). No new WARN/ERROR findings from this work; existing
warnings were recorded separately and not modified. See the [Supabase RLS linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Remaining and Go/No-Go

**Production: NO-GO.** Needs real iPhone/PWA and Android checks, actual media health,
protected Vercel route evidence, notification tap/logout/ended-link evidence,
current production backup success and measured remaining platform allowances.
There is no current successful-backup proof; do not apply production SQL without it.

Before any real TEST send: identify and confirm the user's newly registered TEST
subscription, verify exactly one valid intended endpoint, name the performer/test
LIVE and time window, request separate section-21-D approval for at most one
notification, then enable only that limited test. Keep all production flags OFF.
After the attempt, stop the TEST master and sender, preserve ambiguous results and
never resend them automatically.

Phase A remaining: reservation ten-minute reminders and schedule changes/cancels,
plus shared quotas with the existing appearance dispatcher. Their existing source
tables and TEST pg_cron extension were found, but no cron/job was installed or
changed. Timed reminders while all apps are closed need a separately reviewed
scheduler; the host heartbeat cannot supply that timing. Phase B/C remain pending.
