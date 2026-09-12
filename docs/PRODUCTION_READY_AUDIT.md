# Production Ready Audit

Target event: 2026-10-10 to 2026-10-12, 受賞者たち Presented by 大道芸博 2026.

This document intentionally contains no secret values.

## Checkpoint

- Branch: `cursor/restore-dark-neon-ui`
- Checkpoint commit: `01f0880 Prepare production readiness foundations`
- Verified before commit:
  - `git diff --check`
  - `npm run typecheck`
  - API TypeScript check with `npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck --types node ...`
  - `npm run build`

## Vercel Environment Variables

| Name | Preview | Production | Purpose | Can verify from repo | Breaks if missing |
| --- | --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Required | Required | Client Supabase URL | Name only | Auth, profiles, event ops, voting, follows, comments, merch UI |
| `VITE_SUPABASE_ANON_KEY` | Required | Required | Client Supabase anonymous key | Name only | Auth and every Supabase browser flow |
| `SUPABASE_URL` | Required for API | Required for API | Server Supabase URL | Name only | Stripe APIs, LiveKit token API |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for API | Required for API | Server-only Supabase service role | Name only | Stripe Checkout creation, webhook finalization, merch orders |
| `SUPABASE_ANON_KEY` | Optional if `VITE_SUPABASE_ANON_KEY` is present | Optional if `VITE_SUPABASE_ANON_KEY` is present | Server user-session validation fallback | Name only | API auth if `VITE_SUPABASE_ANON_KEY` unavailable server-side |
| `STRIPE_SECRET_KEY` | Required for payment testing | Required for live payments | Server-only Stripe API key | Name only | Tips, merch checkout, Connect onboarding |
| `STRIPE_WEBHOOK_SECRET` | Required | Required | Verifies platform Stripe webhook signatures | Name only | Legacy/platform webhook finalization |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Required for Connect test | Required for Connect live | Verifies Connect webhook signatures for connected-account Direct Charges | Name only | Direct Charge finalization, refund/dispute tracking, onboarding status sync |
| `STRIPE_ALLOW_LIVE` | Usually unset | Required only with `sk_live_` | Explicit guard for live Stripe charges | Name only | Live Stripe key use is blocked unless set to `true` |
| `APP_URL` | Recommended | Required | Checkout/Connect return origin | Name only | Incorrect return URLs if Vercel fallback is wrong |
| `LIVEKIT_URL` | Required | Required | Server LiveKit URL | Name only | Live token issuance |
| `VITE_LIVEKIT_URL` | Required | Required | Client LiveKit URL and server fallback | Name only | Live viewing/hosting UI |
| `LIVEKIT_API_KEY` | Required | Required | Server-only token signing key | Name only | LiveKit token API |
| `LIVEKIT_API_SECRET` | Required | Required | Server-only token signing secret | Name only | LiveKit token API |
| `VERCEL_PROJECT_PRODUCTION_URL` | Automatic | Automatic | Vercel fallback origin in production | Name only | Used when `APP_URL` is absent |
| `VERCEL_ENV` | Automatic | Automatic | Detects production fallback behavior | Name only | Used by server origin fallback |
| `VITE_APP_MODE` | Optional | Optional | `demo` enables demo data; default is production-like public mode | Name only | Wrong value can show demo data |

Local audit result: Vercel CLI is not installed and `.vercel` project metadata is absent, so actual Preview/Production env presence cannot be verified from this workspace.

## Supabase Migration Classification

| File | Classification | Notes |
| --- | --- | --- |
| `20260726_platform_beta.sql` | Production required; verify applied | Base profiles, performers, follows, tips, live sessions, notifications, admin audit, avatars bucket, core RLS. |
| `20260728_fix_performer_public_read.sql` | Production required; verify applied | Fixes approved performer public visibility and safely activates already-approved pending profiles. |
| `20260728_fix_performer_grants_and_approve.sql` | Human review required | Contains useful grants and public read policy, but also force-approves test performers. Do not apply blindly to production. |
| `20260729_native_livekit.sql` | Production required; verify applied | Adds live title, comments, viewer peak, realtime tables/publications. |
| `20260730_live_tip_events.sql` | Production required; verify applied | Adds server-verified live tip event overlay table and realtime publication. |
| `20260816_secure_tips_and_notifications.sql` | Production required; verify applied | Locks tip updates to admins/service role, restricts notification inserts, adds notification triggers. |
| `20260902_launch_foundation.sql` | Production required; verify applied | Adds organizer role, event/venue/slot/lineup, oshi, votes, reports, booking, push, pitch spots, featured event seed. |
| `20260903_organizer_and_appearance_notify.sql` | Production required; verify applied after 20260902 | Updates signup trigger to allow organizer and adds appearance notification RPC. |
| `20260904_live_event_bind.sql` | Production required; verify applied after 20260902 | Binds live sessions to event/venue and marks stream slots. |
| `20260905_ops_foundation.sql` | Production recommended; verify applied | Adds analytics/ops tables. Not required for core audience flow, but required for admin ops screen. |
| `20260909_safe_runtime_grants.sql` | Production required if grants were not already applied | Safe replacement for the useful grant/policy portion of `20260728_fix_performer_grants_and_approve.sql`; does not force-approve performers. |
| `20260909_avatar_storage_hardening.sql` | Production required after avatars bucket exists | Restricts avatar upload MIME and size. |
| `20260909_merch_foundation.sql` | Production required for merch | Adds merch products/orders, RLS, settings, storage bucket/policies. |
| `20260910_product_event_kpis.sql` | Production required for post-UX KPI tracking | Expands the `product_events.name` constraint for home/live/profile/follow/tip/merch/vote funnel events. Does not mutate existing rows. |
| `20260912_stripe_connect_direct_charges.sql` | Production required for final payments | Adds Direct Charge tracking columns, Stripe webhook idempotency table, minimum tip setting, refund/dispute fields, and payment summary view. Additive only. |

Non-migration SQL files:

- `phase1_preflight_readonly.sql`: read-only preflight, safe to run before applying migrations.
- `phase1_healthcheck.sql`: read-only health check, safe to run after migration review.
- `phase1_apply.sql`: older additive one-shot. Prefer the ordered `supabase/migrations` files unless recovering an old partial DB.
- `phase1_delta_missing.sql`: conservative recovery script for partial Phase 1 DBs. Human review before production.
- `phase1_live_bind.sql`: duplicate of `20260904_live_event_bind.sql`; no need if migration file applied.
- `ops_foundation.sql`: duplicate of `20260905_ops_foundation.sql`; no need if migration file applied.
- `seed_202610_event_template.sql`: data import template. Ends with `ROLLBACK` by default.

## Supabase Required DB State

- RLS enabled: `profiles`, `performers`, `live_sessions`, `follows`, `tips`, `notifications`, `admin_audit`, `live_comments`, `live_tip_events`, `events`, `event_venues`, `event_slots`, `event_lineup`, `oshi`, `event_votes`, `reports`, `booking_inquiries`, `push_subscriptions`, `pitch_spots`, `merch_products`, `merch_orders`.
- Storage buckets: `avatars` public with image-only/5MB limit; `merch` public with image-only/5MB limit.
- Signup: `handle_new_user` must create `profiles`; performer signup must create `performers` with `is_approved=false`; organizer role must be accepted.
- Performer approval: admin can update performer `is_approved=true` and profile `status=active`.
- Events: featured event slug `award-winning-performers-2026` must exist and be published.
- Timetable/MAP: `event_venues`, `event_slots`, `event_lineup` must contain real event data.
- Votes: `event_votes` allows one vote per fan per event.
- Live: `performers.is_live`, `live_sessions`, `live_comments`, `live_tip_events`, realtime publications must exist.
- Tips: `tips` accepts pending insert from authenticated fan; webhook/confirm updates via service role.
- Merch: `merch_products` active/sold_out public read; seller can manage own products; `merch_orders` readable by buyer/seller/admin and written by service role.
- Product events: `product_events.name` must accept both legacy events and the current KPI events (`home_view`, `live_view`, `performer_view`, `follow_click`, `follow_complete`, `tip_cta_click`, `tip_amount_select`, `tip_checkout_start`, `tip_complete`, `merch_view`, `merch_checkout_start`, `merch_purchase`, `vote_complete`).

## Stripe

Required webhook endpoint:

- `https://YOUR_DOMAIN/api/stripe/webhook`

Required events:

- Platform webhook: keep `checkout.session.completed` and `checkout.session.expired` for legacy/platform-scoped sessions during rollout.
- Connect webhook: enable events on connected accounts for `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, and `account.updated`.
- `payment_intent.succeeded` is the durable paid signal for Direct Charges; `checkout.session.completed` remains a fast-path signal and is idempotent.
- `charge.refunded` and dispute events update refund/dispute tracking fields without creating duplicate revenue.

Live charges are deliberately blocked when `STRIPE_SECRET_KEY` starts with `sk_live_` unless `STRIPE_ALLOW_LIVE=true`.

## LiveKit

Required Production variables:

- `LIVEKIT_URL`
- `VITE_LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Viewer tokens may be anonymous only when the performer is approved and currently live. Host tokens require the signed-in performer and approval.

## 2026-10-10 Event Data Checklist

Prepare this as CSV/spreadsheet before using `supabase/seed_202610_event_template.sql`.

| Data | Required fields |
| --- | --- |
| Event | slug, Japanese/English name, presenter labels, date label, place label, hours label, weather notes, start/end dates, status, featured flag |
| Venues/stages | stable venue id, event slug, Japanese/English name, description, lat, lng, sort order |
| Performers | account email, display name, stage name, genre, country/city, bio, photo, SNS, video URL, approval status |
| Lineup | event slug, performer account email, sort order |
| Slots | event slug, venue id, performer email, date, start/end time, stage labels, stream flag, notes |
| Vote targets | event lineup performers; no separate table needed beyond lineup/votes |
| MAP | venue coordinates and stage descriptions |
| Goods | seller email, product name, description, image URL, price, stock, draft/active state |
| Admins | admin account emails; apply role/status update manually after account signup |

Use `seed_202610_event_template.sql` only after replacing placeholders. First run must keep `ROLLBACK`, inspect summary, then change to `COMMIT` only after approval.

## E2E Test Plan

Prioritize iPhone Safari. Repeat core payment flows in Stripe test mode before live mode.

| Role | Test flow |
| --- | --- |
| Anonymous | Open `/`; browse event info, performers, timetable, map; open `/live?merch=1`; view goods list/detail; open active live; verify watching works without login; verify comment/tip/purchase asks for login. |
| Fan | Sign up, confirm/login; edit fan profile if available; follow performer; vote once; open live; post comment; tip via Stripe test Checkout; verify success page and no duplicate success on refresh; buy goods; verify purchase history. |
| Performer | Sign up via performer CTA; verify role performer and pending state; create/edit profile; upload image; cannot sell active goods or go live before approval; after approval, connect Stripe, register goods, start live, see comments/tip overlays/orders. |
| Organizer | Sign up as organizer; login; verify organizer home and performer browsing; verify no admin-only write access. |
| Admin | Login; approve performer; suspend performer with confirmation; manage event/venues/slots/lineup; run appearance notification; view users/metrics/ops; verify destructive actions require confirmation. |

Regression checks:

- `npm run typecheck`
- API TypeScript check
- `npm run build`
- Mobile viewport smoke for `/`, `/live?auth=1&role=performer`, `/live?merch=1`, `/live?watch=<approved-live-performer-id>`
- Stripe webhook replay/idempotency test for completed and expired sessions.
