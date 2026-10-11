import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countCompletedAppearances, countConfirmedSupporters } from '../api/public/performer-stats'

const read = (path: string) => readFileSync(path, 'utf8')

describe('performer profile statistics', () => {
  it('counts each confirmed event appearance once and never counts an unlinked schedule', () => {
    expect(countCompletedAppearances([
      { event_slot_id: 'slot-1' },
      { event_slot_id: 'slot-1' },
      { event_slot_id: 'slot-2' },
      { event_slot_id: null },
    ])).toBe(2)
  })

  it('counts unique identifiable supporters, excludes refunds, and reports anonymous totals as uncounted', () => {
    expect(countConfirmedSupporters([
      { fan_id: 'fan-1', gross_amount_yen: 500, refunded_amount_yen: 0 },
      { fan_id: 'fan-1', gross_amount_yen: 1000, refunded_amount_yen: 0 },
      { fan_id: 'fan-2', gross_amount_yen: 500, refunded_amount_yen: 500 },
      { fan_id: 'fan-3', amount_cents: 300, refunded_amount_yen: 0 },
    ])).toBe(2)
    expect(countConfirmedSupporters([
      { fan_id: 'fan-1', gross_amount_yen: 500, refunded_amount_yen: 0 },
      { fan_id: null, gross_amount_yen: 500, refunded_amount_yen: 0 },
    ])).toBeNull()
  })

  it('uses only existing ledgers, live-mode settled support, and viewing logs', () => {
    const api = read('api/public/performer-stats.ts')
    expect(api).toMatch(/from\('follows'\)/)
    expect(api).toMatch(/from\('live_sessions'\)[\s\S]*not\('ended_at', 'is', null\)[\s\S]*not\('event_slot_id', 'is', null\)/)
    expect(api).toMatch(/eq\('settlement_status', 'settled'\)/)
    expect(api).toMatch(/like\('stripe_session_id', 'cs_live_%'\)/)
    expect(api).toMatch(/is\('dispute_status', null\)/)
    expect(api).toMatch(/from\('product_events'\)/)
  })

  it('renders four iPhone columns and preserves unknown values as uncounted', () => {
    const screen = read('src/platform/screens/PerformerPublicScreen.tsx')
    const css = read('src/platform/screens/performer-home.css')
    const i18n = read('src/i18n/extra.ts')
    expect(css).toMatch(/grid-template-columns:\s*repeat\(4,/)
    expect(screen.match(/<div title=\{t\('hp[A-Za-z]+Definition'\)\}/g)).toHaveLength(4)
    expect(screen).toMatch(/value === null \? t\('hpUncounted'\)/)
    expect(i18n).toContain("hpUncounted: '未集計'")
    expect(i18n).toContain("hpUncounted: 'Not counted'")
    expect(i18n).toContain("hpUncounted: '尚未統計'")
  })
})
