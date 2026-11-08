# HAKU COMMAND CENTER · DEMO

This standalone review build prioritizes the home screen. It has no dependencies on the existing admin app at runtime, and reads only the synthetic snapshot in source. There are no API requests, payment actions, secret keys, or real performer records.

Run `npm ci` in the repository, then `sh command-center/build.sh`. The build writes three static assets under `command-center/dist`. To review locally, set a temporary `HAKU_PREVIEW_PASSWORD` of at least 12 characters in the shell and run `node command-center/preview.mjs`. The username is `reviewer`. The server defaults to loopback. Run `node command-center/check-webkit.mjs` with Playwright WebKit installed. The local reviewer credential is separate from HAKU production roles. For hosted review, require deployment protection and ship only the three built assets to a Preview environment with no HAKU environment variables.

## Design and data audit

The overview leads with the highest-priority issue, four key figures, the ordered queue, the cumulative sales chart and a fixed-question rules assistant. Each metric and alert leads to its context. The secondary screens are design previews. The System screen switches between normal, zero-activity, and fetch-failure fixtures. The timestamp attached to the snapshot stays fixed when the display reloads.

| Area | Existing source and limits |
|---|---|
| Auth and navigation | `src/haku-admin/HakuAdminApp.tsx` renders the operations tabs. `src/haku-admin/api.ts` sends a Supabase bearer token to `/api/ops/inbox`. The handler delegates to `api/ops/_hakuAdmin.ts`; `api/ops/_guard.ts` checks active admin role and membership/allowlist. This review build leaves that path intact. |
| Overview and freshness | Existing `dashboard` combines profiles, performers, open live sessions, payments and reports. The admin API sends `Cache-Control: no-store`. The console reloads per tab and on demand; the votes tab polls every 15 seconds. Daily comparisons need JST cutoffs, source timestamps and comparable inclusion rules. |
| LIVE | Existing `live` reads session state, start time, peak and heartbeat. `api/livekit/presence.ts` samples viewer counts and handles stale heartbeats. Heartbeat age is a signal, not an observed bitrate, RTT or quality grade. Comments and tips need session-specific aggregation. |
| Sales and Connect | `dashboard` and `money` use tips, merch orders, recorded fees, payouts and the server-side Stripe client. Do not treat a stored transfer state as a reconciled bank payout. Confirm scope, settlement state, fees, refunds and disputes from authoritative sources before displaying real totals. |
| Performers, events and operations | Existing performers/applications and event lineup/slots can drive summaries. LIVE reservations and notification deliveries have existing separate tables and routes. Recent performer logins require server-side authorization and deliberate field selection. |
| Infrastructure | GitHub/Vercel monitoring, Supabase probe status and cost are unavailable in DEMO. No new external AI, monitoring, scheduled polling or billing integrations. |

The next data integration requires a reviewed, read-only projection. Keep HAKU bearer verification and admin checks server-side, separate unavailable and zero values, redact emails and internal IDs from summary payloads, and avoid polling paid or rate-limited services. Approval, transfers, refunds and writes are outside this review build.
