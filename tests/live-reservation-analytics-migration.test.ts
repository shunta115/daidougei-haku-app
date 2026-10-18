import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261018092439_live_reservations_and_viewer_analytics.sql', 'utf8')
const performerScreen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
const viewerScreen = readFileSync('src/platform/screens/LiveListScreen.tsx', 'utf8')
const presenceApi = readFileSync('api/livekit/presence.ts', 'utf8')
const verifier = readFileSync('supabase/verify_live_reservations_analytics_readonly.sql', 'utf8')

describe('LIVE reservation and audience analytics migration', () => {
  it('is additive and does not rewrite existing LIVE, payment, vote, or performer data', () => {
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).not.toMatch(/update\s+public\.(live_sessions|performers|tips|votes|event_votes)/i)
    expect(migration).toContain('create table if not exists public.live_schedules')
    expect(migration).toContain('create table if not exists public.live_reservations')
    expect(migration).toContain('create table if not exists public.live_viewer_samples')
  })

  it('uses explicit least-privilege grants and RLS', () => {
    expect(migration).toMatch(/force row level security/gi)
    expect(migration).toContain('revoke all on table public.live_viewer_samples from anon, authenticated')
    expect(migration).not.toMatch(/grant\s+insert[^;]+live_viewer_samples\s+to\s+(anon|authenticated)/i)
    expect(migration).toContain('user_id = (select auth.uid())')
    expect(migration).toContain('performer_id = (select auth.uid())')
  })

  it('guards the privileged start notification function', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("v_schedule.performer_id <> (select auth.uid())")
    expect(migration).toContain('revoke all on function public.notify_live_reservations_started')
    expect(migration).toContain('grant execute on function public.notify_live_reservations_started')
  })

  it('keeps analytics inserts server-only and notifications idempotent', () => {
    expect(migration).not.toMatch(/grant\s+insert[^;]+live_viewer_samples\s+to\s+authenticated/i)
    expect(migration).toContain("n.kind = 'live_reservation_started'")
    expect(migration).toContain("n.meta->>'scheduleId' = p_schedule_id::text")
    expect(presenceApi).toContain("process.env.ENABLE_LIVE_VIEWER_SAMPLES === 'true'")
    expect(presenceApi.indexOf("ENABLE_LIVE_VIEWER_SAMPLES === 'true'")).toBeLessThan(presenceApi.indexOf("from('live_viewer_samples')"))
  })

  it('does not expose broken reservation controls before the migration exists', () => {
    const api = readFileSync('src/platform/lib/api.ts', 'utf8')
    expect(api).toContain("VITE_ENABLE_LIVE_RESERVATIONS === 'true'")
    expect(performerScreen).toContain('scheduleFeatureAvailable ?')
    expect(performerScreen).toContain('!liveReservationsEnabled')
    expect(performerScreen).toContain('setScheduleFeatureAvailable(false)')
    expect(viewerScreen).toContain('liveReservationsEnabled ? listUpcomingLiveSchedules()')
    expect(viewerScreen).toContain('liveReservationsEnabled && liveSchedules.length > 0')
  })

  it('ships a read-only post-apply verifier for RLS, ACL, function, and row-count checks', () => {
    expect(verifier).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b\s+(into|table|function|on|from|public\.)/i)
    expect(verifier).toContain("c.relforcerowsecurity as force_rls")
    expect(verifier).toContain("has_function_privilege('anon'")
    expect(verifier).toContain("table_name = 'live_viewer_samples'")
    expect(verifier).toContain('(select count(*) from public.live_sessions)')
  })
})
