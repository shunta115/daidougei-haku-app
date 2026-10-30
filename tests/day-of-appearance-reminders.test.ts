import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261029090008_add_day_of_appearance_reminders.sql', 'utf8')

describe('day-of appearance reminders', () => {
  it('is authenticated, follower-scoped, timezone-aware, and idempotent', () => {
    expect(migration).toContain('auth.uid()')
    expect(migration).toContain('f.fan_id = v_user_id')
    expect(migration).toContain('at time zone a.timezone')
    expect(migration).toContain("a.status = 'published'")
    expect(migration).toContain('on conflict (user_id, notification_event_id)')
    expect(migration).toContain('appearance_in_app_enabled')
  })

  it('does not grant reminder creation to anonymous users', () => {
    expect(migration).toContain('revoke all on function public.ensure_my_day_of_appearance_reminders() from public, anon')
    expect(migration).toContain('grant execute on function public.ensure_my_day_of_appearance_reminders() to authenticated')
  })
})
