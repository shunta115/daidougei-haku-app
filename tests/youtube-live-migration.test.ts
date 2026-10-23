import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20261023110000_youtube_live_companion.sql', 'utf8')
const performerSecurity = readFileSync('supabase/migrations/20261003_haku_security_fees_admin.sql', 'utf8')

describe('YouTube LIVE migration', () => {
  it('stores only a validated video reference and an explicit visibility flag', () => {
    expect(sql).toContain('youtube_live_video_id')
    expect(sql).toContain("^[A-Za-z0-9_-]{11}$")
    expect(sql).toContain('youtube_live_enabled boolean not null default false')
    expect(sql).toContain('not youtube_live_enabled or')
    expect(sql.toLowerCase()).not.toContain('stream_key')
  })

  it('reuses the performer-owner RLS policy so another performer cannot update the URL', () => {
    expect(performerSecurity).toMatch(/create policy performers_update_own on public\.performers[\s\S]*id = auth\.uid\(\)/)
    expect(sql).not.toMatch(/grant\s+update/i)
  })
})
