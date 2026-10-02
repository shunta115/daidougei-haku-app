import { describe, expect, it } from 'vitest'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS, systemFeeYen } from '../shared/fees'

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
})
