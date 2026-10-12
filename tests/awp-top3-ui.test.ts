import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const screen = readFileSync(new URL('../src/platform/screens/EventScreens.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/platform/screens/event.css', import.meta.url), 'utf8')

describe('AWP 本日のTOP3 presentation', () => {
  it('keeps the 2026-10-12 ranking separate from prior event days', () => {
    expect(screen).toContain("dateKey(slot.date) === '2026-10-12'")
    expect(screen).toContain('const awpResultsPublished = resultsPublished')
  })

  it('shows official ranking details without exposing vote totals', () => {
    expect(screen).toContain('本日のTOP3')
    expect(screen).toContain("TODAY&apos;S RANKING")
    expect(screen).toContain('row.performer.stage_name')
    expect(screen).toContain('timeKey(slot.start_time)')
    expect(screen).toContain('timeKey(slot.end_time)')
    expect(screen).toContain('onClick={() => onOpenPerformer(row.performer.id)}')
    expect(screen).not.toMatch(/row\.votes/)
  })

  it('has gold, silver and bronze responsive cards', () => {
    expect(styles).toContain('.awp-rank-card--silver')
    expect(styles).toContain('.awp-rank-card--bronze')
    expect(styles).toMatch(/@media\(max-width:359px\)[\s\S]*\.awp-rank-card/)
  })
})
