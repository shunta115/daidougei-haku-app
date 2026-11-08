# Cost limits and minimal device check

## Costs

No new service, paid plan, Vercel Function or cron has been introduced.
The existing Supabase organization reports Pro. This does not prove remaining
allowances or zero overage. Vercel's team response did not expose its current plan;
the cost endpoint returned `404 costs_not_found`. Treat usage/cost as unverified,
not zero. Plans and spend settings were not changed.

At the launch cap, 500 enrollments/attempts per UTC day means up to 15,000 per
30-day month. Five attempts per request means about 3,000 fully occupied send
batches, plus startup, empty, waiting and failure requests. This is a workload
estimate, not a bill. Actual CPU, billed memory, network and database execution
must be measured. smart_push_runs records aggregate outcomes and wall time;
wall time is not a substitute for billed active CPU. Budget can be reduced to
zero and the master can stop sending immediately without a redeploy.

[Supabase pricing](https://supabase.com/pricing) and [Vercel plan details](https://vercel.com/docs/plans/hobby)
were checked on 2026-11-01. Do not assume the public free allowance is unused or
upgrade a plan without approval. Retention changes that delete records need
separate approval; no audit data was deleted.

## Prepare without sending

Use the stable PR120 preview alias, never the production app. Normal Vercel login
is required; do not embed protection secrets in a shared URL. The two QA login
records are in a private local file; they are not personal/production accounts.

1. On the computer, open the TEST preview and log in with the performer QA account.
2. On iPhone Safari, open the same TEST preview with the receiving QA account,
   add it to the Home Screen and open that TEST icon.
3. Open Notifications. It must say sending is paused. Enable LIVE consent and
   approve the OS prompt voluntarily. Do not remove the production HAKU app.
4. On the computer, use the private test mode to check real camera/audio. It must
   stay outside public LIVE/MAP and send zero notifications.
5. Report subscription preparation and media results. The agent must inspect the
   TEST recipient ID/endpoint count before requesting the one-message approval.

## Proposed separately approved real TEST

Only the confirmed user's one new TEST iPhone subscription, one public LIVE by the
selected QA performer, at most one LIVE-start notification after 45 seconds during
the agreed test window. No production recipients, broadcast or marketing.
Sender and database master remain OFF until explicit approval. The TEST account's
hours may be set for the agreed test; production defaults remain 09:00–21:00.
Stop immediately on target mismatch, failing checks or unhealthy media. After the
attempt, stop the master and sender, record Apple/FCM acceptance separately from
physical receipt, and do not repeat an uncertain delivery.
