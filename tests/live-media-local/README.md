# Real local LiveKit media

Run an approved local LiveKit server in development mode on loopback (`livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1 --config-body '{"rtc":{"stun_servers":["127.0.0.1:19302"]}}'`), then run `node tests/live-media-local/run.mjs` from the repository root. Install the locked Playwright Chromium on Linux with `npx playwright install --with-deps chromium`. macOS uses installed Google Chrome; `HAKU_CHROME_PATH` can override it.

This uses actual HAKU host/viewer/media-attachment helpers in separate browser contexts, actual SFU encoding/transport/decoding, synthetic camera/microphone input, audience rejoin and scoped room termination. It blocks non-loopback browser requests. No credentials, Supabase, cloud LiveKit, Egress, paid service or physical device are required. Evidence is written to `HAKU_MEDIA_OUTPUT` (default `/private/tmp/haku-live-media-evidence`).

It does **not** verify the HAKU authenticated token/lifecycle APIs, TEST database lifecycle, cloud networking, physical iPhone Safari lock/resume, real camera quality, HARIBOW's historical network conditions or 500 simultaneous viewers. Local media success must not be reported as those checks passing. `.github/workflows/live-media-local.yml` runs the same check against a version-pinned local SFU container.

The local-only harness permits Chromium loopback ICE candidates and grants synthetic media permissions to both contexts. The SFU advertises a loopback STUN address instead of its default public STUN servers; no STUN service is needed for direct loopback ICE. HTTP routing alone does not intercept WebRTC UDP traffic. These settings affect this test harness only.
