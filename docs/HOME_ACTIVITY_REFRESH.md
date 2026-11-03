# Home activity refresh — Draft, 2026-10-31 JST

Base: main `850424a5e3efdb17d7a9506a840288d4aeeb9955` (#101 and #102 already merged). Work is in `/private/tmp/haku-home-safe`, branch `codex/home-activity-20261031`. The original working directory's uncommitted changes are untouched.

## Behavior

Home introduces LIVE → upcoming LIVE → evidenced activity → newcomers → everyone. Multiple LIVE cards scroll horizontally. A compact next-LIVE reservation entry remains in the first viewport alongside LIVE. With no confirmed LIVE, the actual next published LIVE schedule is the first section. Profile/follow, watch, search, notifications, map and tip navigation use existing callbacks; financial and streaming implementations are unchanged.

`homeDiscovery.ts` is the deterministic policy:

- LIVE requires an approved, publicly discoverable performer returned by `listLivePerformers`, `is_live=true`, and an unended `live_sessions` record whose heartbeat (or initial start if no heartbeat yet) is at most 120 seconds old and not in the future. A YouTube-enabled setting, an elapsed schedule, or an appearance never implies LIVE. This is evidence of the existing lifecycle, not independent media/SFU verification. Missing/stale evidence hides the badge; a long reconnect can temporarily hide a real stream. It never ends a stream or rewrites its state.
- Upcoming uses existing `listUpcomingLiveSchedules` and the existing `VITE_ENABLE_LIVE_RESERVATIONS` flag. Only scheduled, known public performers, from 15 minutes before the current time forward, nearest first. Elapsed starts say “開始待ち”; starts within one hour say “まもなくLIVE”. Confirmed LIVE replaces its performer's scheduled cards with watch access.
- Activity is a future/current **published** appearance, a published upcoming LIVE schedule, or an ended LIVE that started within 30 days. Cancelled, postponed, private and draft appearances do not count. No login, views, follower count, money or generic `performers.updated_at` score. `updated_at` is also changed by LIVE/GPS so it cannot prove a profile edit.
- New performers: created within the last 30 days, excluding future/invalid dates. Dedicated newcomer rail.
- Activity, newcomer and everyone rails rotate stable performer-ID order daily at midnight JST. No popularity ranking. Each rail renders at most 12 cards with an explicit search entry; initial roster retains existing `searchPerformers`' 100-row scope. This is not a guarantee of equal exposure across an arbitrarily large roster. Broader paginated discovery is a future improvement.
- History reads only four lifecycle columns, at most 500 rows, covering open sessions and the last 30 days. This bounded evidence window can omit activity when volume exceeds that limit; no fabricated counts are shown.

## Reservations and freshness

Reuses `reserveLiveSchedule`, `cancelLiveReservation`, `listOwnLiveReservationIds`. A reserved primary button is disabled. Cancellation is a separate details action followed by explicit confirmation. A synchronous lock blocks double writes; failures preserve the original state. An unreadable reservation state is unknown (disabled), never falsely “unreserved”. Mutation revision prevents an older in-flight refresh overwriting a completed change; account ownership prevents another account's cached reservation state appearing as current.

Refresh: 30 seconds only while visible; no overlapping loads; refresh on visibility restoration and online restoration. No Realtime subscription. Failed core reads clear LIVE evidence, optional read failures show a notice. Reuses the published-appearance reader including its existing legacy fallback. No call to `reconcileLivePresence`, whose GET endpoint can mutate LIVE state.

## Parallel work and safety

- #96–#98: experimental streaming files; no shared changed files.
- #99: LIVE UI, app shell, API/types; none changed here.
- #100: lifecycle/DB/API work is not imported. Only `vercel.json` overlaps; our single branch-specific auto-deploy suppression must be preserved alongside its config during a future merge.
- #101/#102: already in base; schedule/share/map behavior retained.
- #103: official performer homepage is not imported. Only `vercel.json` overlaps; no change to its UI/DB/API files.

The branch disables only its own Git auto deployment using [Vercel’s documented branch configuration](https://vercel.com/docs/project-configuration/git-configuration) via `git.deploymentEnabled`; it does not change project settings or other branches. Main is not merged or deployed. No migrations, remote DB queries/writes, service credentials, LIVE start/stop, notification sends, payment/Connect/transfer/refund operations or data deletion are performed.

## Preview model and limitations

The hosted preview is a **static, isolated sample**, built from the real FanHomeScreen/HomeStage with test-only API/auth/track adapters. It visibly identifies sample data. Reservations mutate only an in-memory array; navigation callbacks demonstrate the destination without contacting it. No API functions, cron, Supabase client or credentials are packaged. CSP blocks connect/media/frame/form actions. It uses the existing Vercel project and retains its protection; no paid service is added, and no shared environment variables are changed.

Read-only inspection found existing Preview configuration can inherit LIVE credentials also targeted at Production; this is why the app's normal Git preview is not used. The static artifact does not use those values or execute a remote build. The existing TEST project's Auth/DB policies, reservation feature flag readiness and real service connectivity are **not certified** by the sample preview.

Before production: review the policy/120-second badge threshold, perform a separately authorized TEST Auth → reservation → start → watch → follow regression with isolated services, verify physical iPhone Safari, and obtain separate main-merge and Production-release approval. Any DB/flag/service changes require their own approval. Generic profile edit activity and independently verified YouTube on-air discovery remain unimplemented.

## Reproduce

- `npm run typecheck`
- `npx vitest run`
- `npm run build`
- `node node_modules/vite/bin/vite.js build --config tests/home-preview/vite.config.ts`
- Run `node scripts/prepare-home-preview.mjs` to copy only the six referenced local assets and emit the restrictive static deployment manifest, then run `node tests/home-preview/run.mjs`. This serves localhost and blocks external requests. `HAKU_WEBKIT_EXECUTABLE` can select an installed WebKit; the local default path is macOS-specific.

Lint dependencies are missing from package.json despite the checked-in eslint.config.js. Lint was installed into a disposable `/private/tmp/haku-home-lint` prefix without changing repository dependencies/lockfile. The checked-in config is copied there for module resolution and used with `--config` against the four changed app TS/TSX files.

## Recorded validation

- TypeScript and changed-app-file ESLint pass. App build passes with the existing >500 kB bundle warning.
- Full suite: 85 files, 483 tests passed and one merch-UI reservation test timed out at the unchanged 5-second default while builds ran concurrently. That entire 3-test file passed alone without timeout overrides; the timed-out test completed in 639 ms on that rerun. This is not reported as a single clean full-suite run.
- Final home-focused run: 3 files / 11 tests passed.
- WebKit: 17 checks passed, 0 page errors and 0 external requests; real iPhone and connected TEST services remain unverified.
- Static Preview READY, target=null: https://daidougei-haku-q66izf6xf-daidougei-s-projects.vercel.app/ . Authenticated hosted fetch returned 200 with the restrictive CSP. Deployment source listing contains exactly the 10 intended static files. Existing project framework and SSO settings are unchanged.
- Evidence: docs/validation/home-activity-checks.json and home-activity-webkit.json.
