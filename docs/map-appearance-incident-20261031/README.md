# 出演予定とMAPの不整合 — 2026-10-31

## Read-only evidence

- Incident capture: 2026-10-31 15:57 JST (`06:57Z`). Production Supabase `pmmtijwswzwhuriqhlep` inspected using `BEGIN READ ONLY`; anonymous visibility verified using `SET LOCAL ROLE anon` inside that transaction. No data/schema/settings writes.
- HARIBOW appearance `7480ae6d-10a4-4aed-bb09-1807a6522ee8`: published, date 2026-10-31, start 12:00, end **20:00**, timezone Asia/Tokyo. UTC 03:00–11:00. Venue 静岡駅 / region 静岡駅付近. Both coordinates null. Performer approved and not private-test.
- The existing starts_at OR ends_at query returns HARIBOW at capture time. Six eligible public appearance rows: no pagination cutoff. Anonymous RLS permits the row and performer. RLS is not the cause.
- PAUL's 10/31 appearance has null coordinates too, but venue ランドマークタワー matches the reviewed approximate-location lookup.
- `appearanceMapState` requires `resolveAppearanceLocation`. That resolver only knows four reviewed representatives; 静岡駅 is absent. Both map markers and nearby list derive from that filtered set. The normal schedule does not require location. **This is the direct root cause.**
- PR #104 merged 2026-10-31 13:19:54 JST (`dc6fd1f`). Production deployment `dpl_7fzQa5dYhnULVEEHQa4JgrRErXpz` is READY, main `1b01ba21f89d6cb62c36cde2f75da4750d98b5e9`, and contains #104 (GitHub comparison: ahead 7, behind 0). The deployment's production aliases point at that revision. #104 is deployed, not awaiting release.
- No geographic radius cutoff in nearby appearance ranking; distance only sorts, followed by starts_at. API uses stable starts_at/id ordering and 1000-row pagination.
- Shared schedule/MAP fetch refreshes every 20s plus focus/online/visibility events; map clock every 15s. There is no appearance-specific memo/network cache that explains the deterministic location exclusion. Old client tabs/service-worker state at the original capture cannot be reconstructed.
- Secondary defect: unknown end times were removed from the API as soon as starts_at passed, and from MAP even when already fetched. This is separate from HARIBOW (its end is registered).

## Change

- Separate temporal eligibility from mappability. Keep exact/approved approximate pins as before. Unknown, partial, invalid or unreviewed positions remain visible in a dedicated **位置未確定の出演予定** MAP section with date/time, venue, profile and venue search. No fabricated pin/distance/route and no automatic geocoding or DB backfill.
- Keep end-unknown plans through their performance date in their stored timezone, as **出演予定**, never performance-window/LIVE. Known ends retain half-open start/end semantics. Invalid dates/ends are rejected.
- Fetch a conservative UTC envelope of recent end-unknown rows, then filter using each row's timezone. Future and ongoing rows still use starts_at/ends_at. Stable pagination remains intact. Public cancellation/postponement notices stay in schedule while excluded from MAP.
- MAP now surfaces shared appearance-fetch failures. LIVE/event-only filters exclude unlocated scheduled plans. Existing focus refresh removes cancellations without remounting.
- No API endpoints, RLS, schema, migrations, production DB, or saved coordinates changed. No production deployment, main merge, or environment variable changes.

## Verification and limits

See validation.json and browser-result.json. Browser checks use real React + WebKit iPhone13 emulation, offline API/Maps fixtures; they do not validate physical iPhones, real Google Maps, or production interaction after release. Unknown locations intentionally have no map pin. The original 15:57 browser state cannot be recovered; current production row timestamps are evidence of stored data, not a snapshot of that browser.
