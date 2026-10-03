import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MERCH_SYSTEM_FEE_BPS,
  TIP_SYSTEM_FEE_BPS,
  applicationFeeOverageYen,
  settleSale,
  systemFeeYen,
} from '../shared/fees'

describe('HAKU system-use fees', () => {
  it('uses 15% for tips and 8% for goods in whole yen', () => {
    expect(TIP_SYSTEM_FEE_BPS).toBe(1500)
    expect(MERCH_SYSTEM_FEE_BPS).toBe(800)
    expect(systemFeeYen(1000, TIP_SYSTEM_FEE_BPS)).toBe(150)
    expect(systemFeeYen(1000, MERCH_SYSTEM_FEE_BPS)).toBe(80)
    expect(systemFeeYen(1, TIP_SYSTEM_FEE_BPS)).toBe(0)
    expect(systemFeeYen(7, MERCH_SYSTEM_FEE_BPS)).toBe(0)
    expect(systemFeeYen(999, TIP_SYSTEM_FEE_BPS)).toBe(149)
    expect(systemFeeYen(0, TIP_SYSTEM_FEE_BPS)).toBe(0)
    expect(systemFeeYen(-1000, TIP_SYSTEM_FEE_BPS)).toBe(0)
    expect(systemFeeYen(1000.5 as number, TIP_SYSTEM_FEE_BPS)).toBe(0)
  })

  it('does not treat a 10% fallback as the current tip rate', () => {
    expect(systemFeeYen(1000, 1000)).toBe(100)
    expect(systemFeeYen(1000, TIP_SYSTEM_FEE_BPS)).not.toBe(100)
  })

  it('takes the system-use fee from the amount after the real Stripe fee', () => {
    const tip = settleSale(1000, 36, TIP_SYSTEM_FEE_BPS)
    expect(tip.netYen).toBe(964)
    expect(tip.hakuFeeYen).toBe(144)
    expect(tip.performerShareYen).toBe(820)
    expect(tip.hakuFeeYen).not.toBe(150)

    const merch = settleSale(1000, 36, MERCH_SYSTEM_FEE_BPS)
    expect(merch.hakuFeeYen).toBe(77)
    expect(merch.performerShareYen).toBe(887)
    expect(merch.hakuFeeYen).not.toBe(80)

    expect(settleSale(100, 100, TIP_SYSTEM_FEE_BPS)).toMatchObject({ netYen: 0, hakuFeeYen: 0, performerShareYen: 0 })
    expect(applicationFeeOverageYen(150, 144)).toBe(6)
    expect(applicationFeeOverageYen(144, 144)).toBe(0)
  })

  it('keeps new checkout pricing server-authoritative', () => {
    const tipSource = readFileSync(new URL('../api/stripe/tip.ts', import.meta.url), 'utf8')
    const merchSource = readFileSync(new URL('../api/stripe/merch.ts', import.meta.url), 'utf8')
    expect(tipSource).toContain('const feeBps = PLATFORM_FEE_BPS')
    expect(merchSource).toContain('const feeBps = MERCH_SYSTEM_FEE_BPS_DEFAULT')
    expect(tipSource).not.toContain("getBpsSetting(sb, 'tip_fee_bps'")
    expect(merchSource).not.toContain("getBpsSetting(sb, 'merch_fee_bps'")
  })
})
