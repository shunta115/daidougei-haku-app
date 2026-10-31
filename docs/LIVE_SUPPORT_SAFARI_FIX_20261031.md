# LIVE support tap repair — 2026-10-31

Base: main 850424a5e3efdb17d7a9506a840288d4aeeb9955.

## Cause

In phone portrait, `.pl-live__stage` creates an isolated stacking context. The sibling `.pl-live__panel--live` is positioned above that entire context at z-index 6. Its transparent 76px top padding and 72px right padding cover part of the side action rail. The rail's z-index 7 is local to the stage, so it cannot escape its parent's context. Taps in the overlapping area land on the panel instead of the support button.

Separately, the bottom support button forced anonymous visitors to authentication; it now uses the same amount-selection route as the side button.

The side support button already has a native button onClick callback and no disabled or authentication condition. Both guest and signed-in PlatformApp branches route that callback to TipScreen. There is no amount modal in this implementation: the amount selection is a dedicated screen. TipScreen accepts guests and uses the existing `/api/stripe/tip` flow with a stable checkout request ID. The server validates performer approval/status, amount and payer identity and confirms success through the existing signed webhook/receipt flow.

## Repair

Only the portrait viewer panel's box becomes `pointer-events: none`; its direct content children regain `pointer-events: auto`. This lets transparent padding pass touches through while retaining comments, composer and panel controls. No additional touch handler is registered, avoiding duplicate checkout actions from touch and click events. The secondary bottom support button also uses the existing guest-capable onTip route instead of forcing login. Comment/follow authentication remains enforced. No payment, transfer, refund or database code changes.

## Verification scope

- TypeScript: passed.
- Production build: passed; existing large-chunk warning.
- Targeted Vitest: 83 tests passed across routing, payment safety, tip approval and receipt confirmation.
- WebKit iPhone 13 portrait and landscape: passed for guest and signed-in touch, pre-fix/post-fix hit testing, amount selection and mock checkout, plus landscape bottom-button amount selection; zero page errors.
- Added `tests/live-support-e2e/run.mjs`: real ConnectedLiveWatchScreen, LiveWatchScreen and TipScreen, production CSS, isolated data/auth adapters. Uses iPhone 13 WebKit touch input, demonstrates pre-fix interception via elementFromPoint, verifies post-fix hit target, guest/signed-in composer state, amount selection and existing checkout request contract; also covers the landscape bottom support CTA.
- The browser checkout endpoint is deliberately mocked. It proves UI wiring, not a Stripe payment. LIVE media transport is offline in this harness.
- Actual Stripe Sandbox payment, signed webhook, test DB receipt, and physical iPhone Safari remain unverified until a dedicated test environment is available. Do not treat this Draft PR as end-to-end payment acceptance.

Run:

```sh
npm ci
npx playwright install webkit
node tests/live-support-e2e/run.mjs
npm run typecheck
npx vitest run tests/tip-approval.test.ts tests/tip-confirmation.test.ts tests/payment-safety.test.ts tests/routing.test.tsx
npm run build
```

Browser evidence defaults to `/tmp/haku-live-support-evidence`. `HAKU_WEBKIT_EXECUTABLE` can select an installed WebKit executable. External browser requests are blocked; the fixture never contacts Stripe or Supabase.

## Remaining acceptance

Using only a verified Stripe Sandbox and isolated test DB, test guest and signed-in users from the LIVE side button through amount selection, Stripe test-card submission, signed webhook completion and confirmed receipt. Also verify cancellation/retry, and perform the touch flow on physical iPhone Safari. Never use live keys, production DB, real charges, transfers or refunds. Keep this PR draft until this evidence is recorded.
