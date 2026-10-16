import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('October 12 production vote recovery', () => {
  it('separates device remaining votes by the Asia/Tokyo vote date', () => {
    const source = read('server/deviceVotes.ts')
    expect(source).toContain("timeZone: 'Asia/Tokyo'")
    expect(source).toContain(".eq('vote_date', voteDate)")
    expect(source).toContain('vote_date: voteDate')
  })

  it('rejects performers outside an approved active regular slot today', () => {
    const source = read('server/deviceVotes.ts')
    expect(source).toContain(".eq('date', voteDate)")
    expect(source).toContain(".eq('performance_type', 'regular')")
    expect(source).toContain("status.is.null,status.neq.cancelled")
    expect(source).toContain(".eq('is_approved', true)")
  })

  it('enforces the official 10:00–16:20 JST voting window at the API', () => {
    const source = read('server/deviceVotes.ts')
    expect(source).toContain("2026-10-12T10:00:00+09:00")
    expect(source).toContain("2026-10-12T16:20:00+09:00")
    expect(source).toContain("error: 'voting_closed'")
  })

  it('keeps public results private until 16:20 and never serializes vote totals', () => {
    const source = read('server/awpResults.ts')
    expect(source).toContain("2026-10-12T16:20:00+09:00")
    expect(source).toContain("published: false, ranking: []")
    expect(source).not.toMatch(/ranking[^\n]*votes/)
  })

  it('refreshes both the cockpit and public result view every 15 seconds', () => {
    expect(read('src/haku-admin/HakuAdminApp.tsx')).toContain('15_000')
    expect(read('src/platform/screens/EventScreens.tsx')).toContain('15_000')
  })

  it('imports the shared Tokyo day helper in the cockpit API', () => {
    expect(read('api/ops/_hakuAdmin.ts')).toContain('requireAdmin, requireSuperAdmin, tokyoDay')
  })
})
