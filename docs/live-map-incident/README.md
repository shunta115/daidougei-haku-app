# HARIBOW LIVE MAP incident — 2026-10-31

Production inspected READ ONLY. Base main dc6fd1fc (#104), independent branch codex/live-map-discovery. No production DB/schema/data changes, payments, merges, or production deployment.

## Evidence / cause

At 13:46 JST HARIBOW (`d8255f89-61c0-4e69-8109-4b0a996a4724`) was approved, public (`is_private_test=false`) and live. Session `215e2094-bc44-4437-9c00-f1242d01521b` began 13:24:22 JST, ended_at/ended_reason NULL; heartbeat 13:45:59 JST. share_location=true but lat/lng/location_updated_at all NULL. No performer_appearances rows exist for HARIBOW. Session performer_id matches the performer; venue_id/event_slot_id NULL. Anonymous-role SELECT also returns HARIBOW as live. Production edge logs contain successful iPhone Safari performer GET requests (200) around 13:42 and continuing session updates. No evidence of a fetch failure causing this incident.

Production is READY at dc6fd1fc (#104). #101 and #104 retained the `isFreshLiveLocation` LIVE filter: live + location sharing + finite coordinates + location updated within 90 seconds. Both marker and nearby LIVE list reused that filtered array. Therefore a valid LIVE without GPS disappeared from both. Refreshing every 20 seconds or invalidating cache cannot supply missing coordinates. Neither PR added a location-independent LIVE directory.

## Fix

Separate LIVE discoverability from map positioning. Every approved public native LIVE appears immediately below the map in 配信中一覧, even without GPS or while map loading fails. Marker and directory taps invoke HAKU's existing onWatchLive performer route. Fresh shared GPS retains priority. Otherwise, only a single ongoing published appearance with an existing reviewed location resolver can supply a venue marker, explicitly labelled 概略位置 / 現在地未確認. Future, expired, missing-end, private, cancelled and conflicting venues cannot locate a LIVE. No guessed city/profile position or coordinate persistence. HARIBOW currently uses the locationless directory only.

Keep the existing 20-second visible polling, Realtime performer updates and focus/visibility/online refresh; remove records immediately on private/unapproved Realtime updates. Read is_private_test explicitly so privileged logged-in viewers cannot publish a private LIVE in this directory. Existing appearance markers are unchanged.

## Verification boundaries

Automated unit/regression tests and real React MAP running in WebKit iPhone 13 emulation. API, Google Maps and broadcast state are offline fixtures. LIVE start → map directory/marker → watch callback with performer ID → end/removal verified, including missing GPS, a second performer, missed Realtime/focus recovery, and private LIVE. Existing routing and LIVE tests cover the watch screens. This does not claim a real broadcast, a real payment, or physical iPhone success. No production broadcaster interaction or end command was performed.

Main merge and production deployment require separate user approval. Physical iPhone validation remains advisable before release.
