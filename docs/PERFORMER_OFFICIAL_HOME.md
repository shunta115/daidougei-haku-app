# Performer official homepage — development and release gate

Base: GitHub main `398d05b9c51ed84ed0b1a3bb1c7beae62a52f616`, tree `da4b18d980dbe1690b2f1aff57d1c331588fc9c7`. The independent local snapshot was compared against the downloaded main archive and its Git tree verified. The original user's checkout, including its uncommitted work, is untouched.

## Audit and compatibility

The actual app uses Vite/React, Vercel Node API handlers and Supabase, rather than Next.js. Keep that stack. Public URLs remain `/performer/:uuid`; follow, LIVE, tips, merch, existing appearances and event slots retain their existing calls. No copied schedule table, payment implementation or LIVE implementation was added.

PR #99 (immersive LIVE), #100 (HARIBOW lifecycle) and #102 (QR/share) were inspected on 2026-10-31 JST. All were draft/open. This branch changes the public performer component also changed by #102; merge those UI/import changes with care. It adds a dispatch to `api/ops/inbox.ts`, so future changes to that dispatch also require integration review. No competing PR is merged here.

The three requested reference images were not present in the chat. Layout follows the written specification: white surface, dark/blue/pink actions, large contain-fit hero, thumbnails, gallery grid, responsive details and press kits. Exact image matching remains unverified. No invented follower counts, awards or production performer records were added.

## Implementation

- Up to 20 photos, five PDF files and ten YouTube videos per performer. JPEG compression to 1600px and 400px thumbnails in browser; originals and EXIF are not uploaded. Multi-upload is sequential to bound memory/network usage. Native HEIC support depends on browser decoding; conversion guidance appears on failure.
- Sort with drag/drop or touch-friendly previous/next controls; reorder and replacement use single SQL transactions. Main image/video designation persists. Retry uses stable upload UUIDs so a lost response does not duplicate a successful upload.
- New files start private. A private Storage bucket has no new client policies. File retrieval checks the approved active performer, page visibility, asset visibility and exact performer/asset match on every request. Bytes proxy through API, with `no-store`, no long-lived signed URL, and `nosniff`.
- PDF limit 2MiB, 1–100 pages. `pdf-lib` parses actual bytes. Reject encrypted, malformed/truncated files, scripts, forms, actions and attachments. Download uses safe RFC5987 filename; uploaded names never form object paths.
- Existing profile fields and SNS remain in their original editor; the separate official-home editor covers detailed biography, furigana, tagline, career, awards, media, credits, areas, event types, repertoire, duration, space and equipment. Unfilled rows are absent. Draft detail preview is local until saved; media changes save immediately and explicitly show visibility.
- Booking validates ten fields plus selected performer. A hidden honeypot, minimum completion time, bounded payload, same-origin JSON and DB-backed 5/hour per trusted-IP hash reduce spam. IPs are not stored. This is baseline abuse protection, not a distributed botnet-proof guarantee.
- Booking cases live in a non-exposed schema. Only service-role RPCs can access it; the API requires the existing `requireAdmin` gate. Never forward to performer. Saving a case and creating existing HAKU notifications for active office admins is one transaction. Missing office recipients fails closed. Notifications contain no requester details. Office must open `/haku-admin?section=bookings` and manually contact the performer.
- Server-generated per-page title/description/OGP/canonical/ProfilePage JSON-LD. Preview is noindex. Main legacy shell is preserved with feature flag off. Private/unapproved/private-test profiles return noindex 404 when enabled. This does not retroactively erase a previously public image/PDF copied by a visitor.

## Environment / rollout

`HOME_ENABLED=true` enables new endpoints. Default is disabled. `PUBLIC_SITE_URL` is the HTTPS canonical origin without a slash. `BOOKING_RATE_LIMIT_SECRET` is a random server secret of at least 32 characters. Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and office allowlist/member configuration remain required. No secret belongs in VITE variables. Preview code permits only the existing TEST project `aeqskxxykzapgaudbeqa`; production DB is not a valid preview target.

New migration: `supabase/migrations/20261030213928_performer_official_home.sql`. It is reviewable, additive and unapplied to production. New tables/bucket deliberately fail on accidental duplicate application; do not run twice. Do not undo by deleting performer data. Rollback application by disabling HOME_ENABLED and reverting code; retain uploaded data for a reviewed cleanup later.

On 2026-10-31 the remote TEST migration attempt was rejected by automatic approval review because remote target classification and explicit persistent-write approval were considered insufficient. No remote migration ran. A user approval request specifically naming `haku-merch-validation` / `aeqskxxykzapgaudbeqa` is pending. Do not bypass it through another tool, REST, SQL or credentials. Local PGlite testing remains separate from hosted Supabase/Storage verification.

## Cost estimate

No new paid provider/plan or fixed charge. No image transformation service or video hosting. Existing Supabase and Vercel usage can still incur variable charges.

Typical assumption: 20 × (300KB photo + 20KB thumb) + 5 × 2MB PDF ≈16.4MB per performer. Hard upper bound is approximately 52MB including thumbnails. At 1000 performers typical storage ≈16.4GB; this competes with existing quota. A 1000-view photo-heavy scenario is about 0.7GB before PDFs and repeat visits. Every 1000 full 2MB PDF downloads adds ≈2GB. API proxying also consumes Vercel requests, function duration and transfer; there is no claim of zero variable cost.

Supabase published pricing checked 2026-10-31: Free includes 1GB Storage and 5GB uncached egress; Pro includes 100GB Storage and 250GB egress, then $0.0213/GB storage and $0.09/GB uncached egress. These are examples of included quotas/overage, not the account's verified remaining allowance. [Pricing](https://supabase.com/pricing). [Private Storage serving](https://supabase.com/docs/guides/storage/serving/downloads). No billing limits or plans were changed.

## Verification and remaining gates

See test output and browser results recorded with this branch. Local browser adapter uses real production API code and migration SQL against an independent PGlite database, and memory-backed Storage. It is not hosted Supabase Storage, a physical iPhone, a real YouTube playback or a real LIVE/payment test. Its synthetic accounts and booking payloads never go to production.

Before production: approve and validate TEST migration first; provision branch-specific test settings securely; verify upload/replacement/private revocation and PDF downloads on hosted Storage; test actual iPhone Safari and provided references; review conflict with #102; review migration/RLS and privacy/abuse controls; separately approve production migration, production environment enablement, main merge and production deployment. No production action is authorized by the Draft PR.

## Repeat local tests

`npm ci`, then `npm run test:official-home`. For browser QA, install the matching Playwright WebKit browser (`npx playwright install webkit`), start `npm run test:official-home:host`, and in another terminal run `npm run test:official-home:browser`. The host binds only `127.0.0.1:5199`. It replaces auth and Storage exclusively inside its testing bundle; application builds do not import those adapters. Optional `WEBKIT_EXECUTABLE`/`PLAYWRIGHT_MODULE` variables support preinstalled browsers. The browser fixtures are not Vite production entries and are excluded from Vercel source packaging.

Local results: feature tests cover upload idempotency, PDF parsing, live byte download, hidden-page revocation, private-test denial, cross-owner edit/delete, admin-only cases, atomic office notifications, rollback on delivery failure, SQL photo limits/replacement/reorder, HTML metadata escaping and the preview TEST-host gate. WebKit completed 16 full-flow checks at 390×844 and 1440×1000 with no browser runtime errors. API/SQL/Storage in this browser run are local test adapters as described above. Initial browser launch incompatibilities were resolved using Playwright 1.59 / Node 24 with the existing macOS-compatible WebKit. A checkbox state-rendering issue discovered by E2E was fixed and rerun successfully. `artifacts/official-home/browser-results.json` records the run; screenshots are local QA artifacts and are not shipped in the app.
