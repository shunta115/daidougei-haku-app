# PC LIVE theater (2026-10-31)

Base: main dc6fd1fc0be0b073cf25be610884c481d07f5e58. Branch: codex/live-pc-theater-20261031.

## Findings

- HAKU DIRECT: `useVideoAspect` subscribed once before the async performer fetch mounted the video. It returned without attaching listeners or polling, leaving the initial 9:16 metadata ratio on desktop. This is a confirmed aspect/layout defect, not evidence of a 90-degree pixel rotation.
- No viewer CSS rotation existed. Host `livePortraitProcessor` uses `containedRect` + `drawImage` without rotation; front-camera mirroring is only `scaleX(-1)` in the host preview. Capture orientation selection and sender pipeline are intentionally unchanged.
- A genuinely sideways encoded frame cannot be identified from videoWidth/videoHeight alone. Real device capture and RTP orientation metadata were not available in this task. Do not claim an upstream rotation cause has been fixed. Desktop viewers can explicitly rotate/reset their local display; the correction never changes published video.
- YouTube official iframe owns its decoded orientation. Its API replaces the mount node, so retain an outer 16:9 frame around that node. No transform is applied to the YouTube player.

## Changes

- Viewer-only desktop CSS in `live-theater.css`: wide 16:9 stage, uncropped contain video (including portrait sources), independent bounded scrolling right comment rail, three existing action buttons, resize and native/fallback fullscreen styles.
- Metadata observer attaches when the async video mounts, follows source dimension changes and cleans up.
- Explicit 90-degree left/right/reset controls on desktop DIRECT, with swapped display dimensions for quarter turns and ResizeObserver updates in fullscreen/resize. Mobile rotation stays 0; existing phone CSS and crop control remain intact.
- YouTube desktop support/instructions on the right. Existing YouTube comments/likes remain on YouTube; this PR does not introduce HAKU chat sessions for YouTube or pretend its API exposes native comments. Existing support and official external link remain available.
- No API, DB schema, payment handler, Stripe configuration, host capture, or Production changes. No new paid service.

## Validation

- TypeScript typecheck passed.
- Vite production build passed (existing chunk-size warning).
- 34 targeted tests passed: camera (30), fever (3), late video mount/resize/cleanup (1).
- Chrome and Playwright WebKit: all 13 browser checks passed, with no page errors (see `browser-result.json`). Both native fullscreen and forced CSS fallback, 80-comment independent scrolling, portrait/landscape synthetic metadata, manual rotation/reset, resize, action handlers, YouTube API mount replacement and iPhone emulation were verified.
- Browser fixture result is recorded separately. It uses actual Chrome and Playwright WebKit, local adapters and synthetic dimensions/poster frames. All external network requests are blocked. Support testing stops at the amount selection screen; no payment is submitted.

## Physical / integration acceptance still required

PC Safari and iPhone Safari hardware, DIRECT real front/rear camera in portrait/landscape and sender rotation during a live session, real RTP orientation metadata, actual YouTube portrait/landscape playback and native player fullscreen, native OS fullscreen on Safari, real multi-user comment/like/follow sync. These were not verified against Production. YouTube native comments/likes and follow behavior retain existing provider limitations.

## Related PRs

#81 changes camera/host and shared CSS; #106 changes viewer, fullscreen and reactions; #107 changes viewer support flow/CSS; #99 includes a separate immersive UI. New desktop rules live in a separate file and do not modify shared `live.css` or `useFullscreen`. Non-mutating `git merge-tree --write-tree` checks found no text conflicts with #81 (3c2034f), #106 (6cb894e), or #107 (2b278c9). This does not prove semantic compatibility. Integration must preserve #107's support tap fix and #106's recovery/reaction work; this PR does not incorporate or supersede them.

## Preview and PR

Draft PR: https://github.com/shunta115/daidougei-haku-app/pull/110

The Vercel Git integration created a READY Preview for source commit 5394116. The deployment is Vercel Authentication protected (HTTP 302 to SSO); connector page fetch failed due to deployment access. Protection was not changed. This confirms build readiness, not live behavior on the deployed environment. The final PR body records the final Preview URL.

## Reproduce local browser checks

```sh
npm ci
npx playwright install webkit
node tests/live-theater-e2e/run.mjs
```

Chrome must be installed; optionally set HAKU_WEBKIT_EXECUTABLE to an installed compatible WebKit `pw_run.sh`. Local fixture API and media replace external services; support stops before checkout. Output defaults to /private/tmp/haku-theater-evidence.
