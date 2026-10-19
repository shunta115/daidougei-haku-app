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
3. `/api/multi-live/egress` starts a room-composite RTMPS Egress for the authenticated performer's derived room, polls LiveKit state, and stops by persisted Egress ID. External failure never rolls back HAKU LIVE.
4. The performer screen shows public/unlisted/private destination scope, starts YouTube after HAKU is live, reports independent state, and attempts Egress cleanup before normal and privacy-triggered termination.
5. Official Google OAuth with `youtube.force-ssl` is implemented. Active live chat messages, replies, Super Chat, and Super Sticker events use YouTube APIs. External revenue is labeled and never written to Stripe/HAKU ledgers.
6. TikTok remains disabled until official external ingest and LIVE API permissions are verified; no cookies or unofficial APIs are used.

## Activation checklist (requires approval)
1. Apply `20261019163855_multi_live_destinations.sql` to the intended environment.
2. Generate `MULTI_LIVE_ENCRYPTION_KEY` with `openssl rand -base64 32`; configure it only in the server environment.
3. Configure `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, and the exact `/api/multi-live/youtube-oauth` redirect URI in Google Cloud.
4. Verify LiveKit Cloud Egress entitlement, quota, region, and cost in TEST. Do not enable paid Egress in production without approval.
5. Run the iPhone/two-viewer-device matrix below before production promotion.

## Exit criteria
- iPhone 1 device publishes to HAKU and YouTube simultaneously, verified on two viewer devices.
- YouTube viewers retain native comments/likes/Super Chat; HAKU viewers retain HAKU comments/tips.
- Integrated comment panel is accepted only after actual OAuth and API testing.
- All production migrations/deployments, paid Egress activation and Stripe transfers require explicit approval.
- Record costs, latency, dropped frames, mobile battery/network usage and failure recovery.
