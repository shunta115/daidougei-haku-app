import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20261023110000_youtube_live_companion.sql', 'utf8')

describe('YouTube LIVE migration', () => {
  it('stores only a validated video reference and an explicit visibility flag', () => {
    expect(sql).toContain('youtube_live_video_id')
    expect(sql).toContain("^[A-Za-z0-9_-]{11}$")
    expect(sql).toContain('youtube_live_enabled boolean not null default false')
    expect(sql).toContain('not youtube_live_enabled or')
    expect(sql.toLowerCase()).not.toContain('stream_key')
  })
})
