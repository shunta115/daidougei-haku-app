# HAKU MULTI LIVE — feasibility and implementation gate

## Verified repository baseline
- React/Vite host UI: `src/platform/screens/PerformerLiveScreen.tsx`.
- LiveKit server dependencies: `livekit-server-sdk` and `api/livekit/_shared.ts`.
- Token API: `api/livekit/token.ts`. Current main permits guest viewer tokens for public streams; private viewer restrictions must be verified and deployed before relying on them.
- This PR adds **capability definitions and unit tests only**, not an operational restreaming service.

## Feasibility
- LiveKit Egress can send one stream to multiple RTMP destinations; can add/remove destinations with UpdateStream.
- YouTube accepts eligible live encoder ingest; official live chat APIs can read and write with suitable OAuth.
- YouTube Super Chat events are external revenue, not HAKU Stripe payments. Do not combine accounting ledgers.
- TikTok external ingest, LIVE comment/gift read/write and OAuth capabilities are account/program dependent. Do not claim universal support or use undocumented session cookies.

## Implementation sequence
1. Verify LiveKit Cloud Egress entitlement, region, quota, concurrent stream cost and source track format. Run Egress against TEST room.
2. Implement authenticated server endpoints: create destination, start/stop egress, status; only owner/admin, active session, no arbitrary room names. Persist egress ID and redacted status. Enforce per-account destination limits and idempotency.
3. Keep stream keys and OAuth tokens server-only with encryption at rest, restricted service roles, no raw URL logs, rotation and revocation. Only allow provider-approved ingest hosts (prevent SSRF).
4. Begin with HAKU+YouTube using RTMPS and single camera; verify viewer audio/video on both services, interruptions, rotation and stop/cleanup. Distinguish transport connected from actual YouTube LIVE status.
5. Add YouTube OAuth with minimum scopes, liveChatMessages.streamList, posting only when authorized, Super Chat event ingestion, pagination/reconnect, quota/backoff, dedupe and provenance labels.
6. TikTok: check official LIVE ingest eligibility and documented interaction APIs; if absent, keep TikTok app's own comments/gifts operational for viewers and show external dashboard link rather than claiming an integrated feed.
7. Add fan-facing opt-in link to HAKU tipping, respecting platform rules; do not imply cross-platform gift settlement.
8. Regression: private LIVE visibility/RLS, direct token requests, unauthorized egress, stop/restart, no secret exposure, failed destinations isolated from HAKU stream.

## Exit criteria
- iPhone 1 device publishes to HAKU and YouTube simultaneously, verified on two viewer devices.
- YouTube viewers retain native comments/likes/Super Chat; HAKU viewers retain HAKU comments/tips.
- Integrated comment panel is accepted only after actual OAuth and API testing.
- All production migrations/deployments, paid Egress activation and Stripe transfers require explicit approval.
- Record costs, latency, dropped frames, mobile battery/network usage and failure recovery.
