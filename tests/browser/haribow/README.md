# HARIBOW isolated browser audit

API/auth/LiveKit/camera are replaced with fixtures. Canvas frames, Room events, and YouTube IFrame API events are synthetic. This does not verify actual media transport, Stripe, YouTube playback, or iPhone hardware. Non-local network requests are blocked.

```sh
node node_modules/vite/bin/vite.js --config tests/browser/haribow/vite.config.mjs
BROWSER=chrome node tests/browser/haribow/run.cjs
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/haku-stage2-browsers BROWSER=webkit node tests/browser/haribow/run.cjs
```

The audit machine uses preinstalled Playwright from `/private/tmp/haku-live-browser-tools/node_modules/playwright` (override `PLAYWRIGHT_MODULE`) and existing Google Chrome. No production dependency was added. The compatible WebKit 26.0 browser was downloaded to an isolated temporary directory, but launch timed out; it was not counted as passed.

Chrome checks (14): viewer audio gesture, reconnect status, reconnect retry, phone follow, tip navigation, end/disconnect; host reconnect status/retry; YouTube autoplay denial, embed-denied escape, follow, tip navigation; host reserve→publish→activate→end order; prepublish background privacy/reprepare. All are MOCK UI ONLY. SQL transaction tests are separate and use ephemeral PGlite.
