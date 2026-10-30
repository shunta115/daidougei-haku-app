# HAKU LIVE localhost browser QA

This harness renders the real `LiveWatchScreen`, `PerformerLiveScreen` and LIVE CSS. A separate Vite configuration replaces Auth, API and LiveKit imports with localhost-only synthetic fixtures. No camera, Supabase, Stripe, real LiveKit connection or external API is used. The production Vite configuration does not reference the harness.

The browser script checks 390×844 and 844×390 viewports, 0/100/1000 displayed comments, stage dimensions, compact settings-sheet coverage, the same video element across mini/restore, and one fixture connection. It writes screenshots and JSON to `/private/tmp/haku-live-layout-qa` by default. These results are layout and simulated lifecycle checks; they are not iPhone Safari, actual media transmission or audio validation.

From the repository root, start the isolated server:

```sh
node node_modules/vite/bin/vite.js --config tests/browser/vite.live.config.mjs
```

Use a separately installed official Playwright package without changing repository dependencies:

```sh
npm install --prefix /private/tmp/haku-live-browser-tools --no-save playwright@1.56.1
node /private/tmp/haku-live-browser-tools/node_modules/playwright/cli.js install webkit
HAKU_PLAYWRIGHT_PACKAGE=/private/tmp/haku-live-browser-tools/node_modules/playwright/index.mjs node tests/browser/live-layout.mjs
```

Set `HAKU_QA_BROWSER=chromium` to run Chromium after installing its browser binary. `HAKU_QA_OUTPUT` changes the artifact directory. The server binds only `127.0.0.1:4179`; do not deploy this fixture as a public app.
