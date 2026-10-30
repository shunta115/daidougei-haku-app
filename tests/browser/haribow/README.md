# HARIBOW isolated browser audit

This fixture substitutes API/auth/LiveKit/camera dependencies. It uses synthetic Canvas frames and a fake Room, and never proves real camera, microphone, LiveKit, Stripe, YouTube or iPhone compatibility. The runner blocks non-local network requests.

From the repository root, run:

```sh
node node_modules/vite/bin/vite.js --config tests/browser/haribow/vite.config.mjs
node tests/browser/haribow/run.cjs
```

The runner uses the preinstalled Playwright at `/private/tmp/haku-live-browser-tools/node_modules/playwright` and existing Google Chrome on this audit machine. Override `PLAYWRIGHT_MODULE` for another Playwright installation. No dependency is added to the production application.

Checks: audio unlock gesture; viewer reconnect status/retry; visible phone follow action; tip navigation; session end/disconnect; host reconnect status/retry. The event emitter is a mock, not a real network disconnect. A separate WebKit attempt failed because the installed SDK/browser versions were incompatible or failed to finish startup; it is not counted as passed.
