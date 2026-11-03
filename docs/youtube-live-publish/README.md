# YouTube LIVE publication repair — 2026-10-31

## Cause and read-only Production evidence

Investigation baseline: Production deployment `dpl_AJ5MPiQgsKQYug4dKduazQ3W2n6i`, GitHub main commit `850424a5e3efdb17d7a9506a840288d4aeeb9955` (Vercel alias `daidougei-haku-app.vercel.app`).

The button in `YouTubeLiveSetup` calls `updatePerformer`, which uses the browser Supabase client to PATCH `public.performers` through PostgREST with the HAKU user's session. There is no intervening Vercel publication endpoint, Google OAuth, YouTube Data API, API key, or stream key.

The canonical URL for video `yk6Kjl0WHWs` is `https://www.youtube.com/watch?v=yk6Kjl0WHWs`. The deployed `performers_youtube_live_url_check` regex over-escapes the dots and question mark. PostgreSQL `standard_conforming_strings` is `on`; the intended canonical URL fails the check. URL parsing and the preview do not write to the DB, so they succeed independently.

Read-only Production log projection (timestamp, SQLSTATE, error message only) found 11 occurrences of `performers_youtube_live_url_check` violations between 2026-10-31 12:06:32 and 13:13:28 JST. Example: 13:13:24.688 JST, SQLSTATE **23514**, `new row for relation "performers" violates check constraint "performers_youtube_live_url_check"`. These logs establish the failure class; they were not correlated to a user's token or request payload. The local PostgreSQL test reproduces the exact video ID failing under the original migration.

Read-only account checks returned one matching performer with matching `profiles.id` and `auth.users.id`, approved performer and active profile. No IDs, email addresses, tokens, row payloads, or raw auth logs are included. All three YouTube columns exist and authenticated UPDATE privileges exist. The owner SELECT/UPDATE RLS and privileged-field trigger are present. No missing account link or YouTube login was identified as the cause.

At preflight, Production had zero registered YouTube URLs, zero rows incompatible with the corrected regex, and zero saved occurrences of the reported video ID. No Production data was written.

## Change

- Forward migration replaces only the faulty URL constraint with a bracket-expression regex. The original migration is preserved as history. A transaction with 5-second lock and 30-second statement limits rolls back on failure.
- A SECURITY INVOKER trigger limits changes to the three YouTube settings to the authenticated owner, including when existing navigator/admin RLS otherwise permits updating another performer. Trusted server/service-role operations without an end-user UID remain governed by their existing access. Existing RLS policies and DIRECT LIVE delegation remain intact. The trigger has a fixed empty search path and no public RPC execution grant.
- A dedicated save helper validates the HAKU session via `getUser`, checks the target ID and active profile, allowlists the three YouTube fields, normalizes the URL, and requires a returned saved row. It uses the end-user client and retains RLS; no service key or RLS bypass is introduced.
- The UI distinguishes expired authentication, permission denial, database failure (safe code only), and network failure. It preserves input for retry, blocks repeated taps while saving, and updates local state from the saved row. A profile refresh failure is explicitly reported as a refresh failure after successful persistence.
- No auth token or personal data is logged. Database messages/details are never displayed; only allowlisted error codes are surfaced.

## Validation

Reproduce locally with `npm run test:youtube`; run iPhone WebKit automation with `npm run test:youtube:safari` after installing the pinned Playwright WebKit browser.

The PostgreSQL suite applies the original migration to PGlite, proves SQLSTATE 23514 for the reported ID, applies the forward repair twice, then tests registration, publication, stop, republication, unlink, registration after unlink, malformed URL rejection, owner RLS, anonymous denial, and denial through delegated navigator update permission. It also verifies DIRECT fields remain unchanged by YouTube saves and delegated DIRECT updates still work.

The helper and UI suites test session/ownership/profile checks, response error categories, zero-row writes, safe error handling, input retention, repeated taps, saved-state recovery after profile refresh failure, DIRECT viewer precedence, and the existing tip action.

The iPhone 13 WebKit run passed 11 checks; see `webkit-validation.json`. It used the real UI and save helper with a local Supabase boundary fixture. All external requests were blocked. This checks mobile interaction and failure handling, not real YouTube playback or a hosted Supabase write. Physical iPhone Safari acceptance remains outstanding.

Type checking and the Vite build passed. The build retains the existing large-chunk advisory. The full regression suite passed **85 files / 500 tests**. The focused YouTube suite passed **5 files / 37 tests**; the final DB suite passed **8 tests** using the Production owner policy and the delegated-update fixture. See `validation.json`.

## Impact and remaining release gates

HAKU DIRECT, LiveKit token/presence/rooms, tips/Stripe, follows, LIVE reservations, notifications and MAP code are not modified. No YouTube save creates or ends a DIRECT live session, changes location sharing, starts a reservation notification, or changes follow/tip data. Existing regression suites cover these paths; a real payment or live broadcast was not initiated.

This is a Draft PR, **not a Production recovery**. Production will continue rejecting publication until the repaired DB constraint is approved and applied. Do not run a broad `supabase db push`: the repository contains unrelated migrations and known schema drift. Review and apply only the targeted forward repair in an approved release, then verify an authorized performer publishing/unlinking/re-publishing on a physical iPhone. The frontend error/ownership improvements also require a separately approved release.

YouTube embedding, privacy and actual broadcast availability remain controlled by YouTube. Google login is not required for this URL registration flow.

Production advisors were read without changes. Existing unrelated search-path, SECURITY DEFINER execution, password-protection and index/RLS-performance notices remain out of scope; this repair adds no SECURITY DEFINER function. See the [Supabase database linter documentation](https://supabase.com/docs/guides/database/database-linter) for those existing notices.

No Production DB changes, main merge, Production deployment, payment changes, emails or direct messages were performed.
