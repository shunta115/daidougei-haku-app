# HAKU MULTI LIVE — feasibility and implementation gate

## Verified repository baseline
- React/Vite host UI: `src/platform/screens/PerformerLiveScreen.tsx`.
- LiveKit server dependencies: `livekit-server-sdk` and `api/livekit/_shared.ts`.
- Token API: `api/livekit/token.ts`. Current main permits guest viewer tokens for public streams; private viewer restrictions must be verified and deployed before relying on them.
- This PR now includes authenticated destination management, encrypted credentials, LiveKit Egress start/stop/status, performer UI, and official YouTube OAuth/chat integration. Production activation still requires the migration, secrets, Google OAuth configuration, and LiveKit Egress entitlement described below.

## Feasibility
- LiveKit Egress can send one stream to multiple RTMP destinations; can add/remove destinations with UpdateStream.
- YouTube accepts eligible live encoder ingest; official live chat APIs can read and write with suitable OAuth.
- YouTube Super Chat events are external revenue, not HAKU Stripe payments. Do not combine accounting ledgers.
- TikTok external ingest, LIVE comment/gift read/write and OAuth capabilities are account/program dependent. Do not claim universal support or use undocumented session cookies.

## Implemented
1. `/api/multi-live/destination` authenticates approved performers and creates, replaces, reads, or deletes one YouTube destination. It accepts only a stream key and assembles the fixed `rtmps://a.rtmps.youtube.com/live2/` URL on the server.
2. Stream keys and OAuth tokens use AES-256-GCM with `MULTI_LIVE_ENCRYPTION_KEY`. The browser receives only redacted configuration and runtime state. The table is RLS-forced and revoked from `anon`/`authenticated`.
3. OAuth state is a high-entropy opaque nonce stored only as a SHA-256 hash, bound to the authenticated performer and an HttpOnly/SameSite browser cookie, expires after 10 minutes, and is atomically consumed once.
4. `/api/multi-live/egress` starts a room-composite RTMPS Egress for the authenticated performer's derived room. A DB lease permits one concurrent start; a losing request is idempotent and never starts a second paid Egress.
5. The stream key is matched against the connected channel's official `liveStreams.list` response. The bound `liveBroadcasts.list` resource supplies the actual privacy and lifecycle status. The performer must explicitly confirm the matching privacy; it is rechecked at start. Private Test Performer LIVE can only target a private YouTube broadcast.
6. LiveKit Egress and per-stream results are reconciled with DB state. Normal stop, a stop/start race, the existing 90-second host heartbeat expiry, and the scheduled reaper all attempt to stop orphaned Egress.
7. The performer screen shows requested and actual YouTube privacy, starts YouTube after HAKU is live, reports independent state, and attempts Egress cleanup before normal and privacy-triggered termination.
8. Official Google OAuth with `youtube.force-ssl` is implemented. Active live chat messages, replies, Super Chat, and Super Sticker events use YouTube APIs. External revenue is labeled and never written to Stripe/HAKU ledgers.
9. TikTok remains disabled until official external ingest and LIVE API permissions are verified; no cookies or unofficial APIs are used.

## Activation checklist (requires approval)
1. Apply `20261019163855_multi_live_destinations.sql`, then `20261019173329_harden_multi_live_oauth_and_egress.sql` to the TEST environment only.
2. Generate `MULTI_LIVE_ENCRYPTION_KEY` with `openssl rand -base64 32`; configure it only in the server environment.
3. Configure `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, and the exact `/api/multi-live/youtube-oauth` redirect URI in Google Cloud.
4. Configure a random `CRON_SECRET` so the scheduled `/api/livekit/presence` stale-session/Egress reaper is authenticated.
5. Enable YouTube Data API v3 for the TEST OAuth client; register the exact TEST origin and redirect URI. The requested scope is `youtube.force-ssl`.
6. Verify LiveKit Cloud Egress entitlement, quota, region, and cost in TEST. Do not enable paid Egress in production without approval.
7. Run the iPhone/two-viewer-device matrix below before production promotion.

## TEST device matrix
1. On iPhone Safari, connect camera/microphone and start HAKU LIVE. Confirm HAKU video, audio, comments, and HAKU tips from viewer A.
2. Save a TEST YouTube stream key, complete OAuth in the same browser, inspect the actual bound broadcast privacy, and explicitly confirm it.
3. Start HAKU+YouTube and confirm independent `HAKU LIVE: 配信中` and `YouTube: 配信中` states. Confirm YouTube video/audio, native like, comment, Super Chat, and Super Sticker from viewer B.
4. Reply from HAKU's YouTube panel and verify the reply appears on YouTube. Confirm paid events say `HAKU投げ銭とは別会計` and no Stripe ledger row is created.
5. Reject OAuth callback replay, a callback in a browser without the binding cookie, two simultaneous Egress starts, key edits while starting/live, and public YouTube for private Test Performer.
6. Disable or invalidate YouTube ingest while live. HAKU video/audio/comments/tips must continue while only YouTube becomes failed.
7. Exercise normal stop, start/stop race, network reconnect, and force-close Safari. Confirm LiveKit Egress is stopped; force-close cleanup occurs after host heartbeat expiry plus the next authenticated reaper run.
8. Inspect browser network/logs and server logs: no stream key, RTMPS URL, OAuth access token, refresh token, or provider error details may appear.

## Exit criteria
- iPhone 1 device publishes to HAKU and YouTube simultaneously, verified on two viewer devices.
- YouTube viewers retain native comments/likes/Super Chat; HAKU viewers retain HAKU comments/tips.
- Integrated comment panel is accepted only after actual OAuth and API testing.
- All production migrations/deployments, paid Egress activation and Stripe transfers require explicit approval.
- Record costs, latency, dropped frames, mobile battery/network usage and failure recovery.
