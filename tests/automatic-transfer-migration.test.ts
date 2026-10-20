import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20261020112849_automatic_performer_transfers.sql', import.meta.url), 'utf8')

describe('automatic transfer migration', () => {
  it('removes the HAKU threshold but rejects a zero-value transfer', () => {
    expect(sql).toContain('check (amount_yen > 0)')
    expect(sql).toContain("if p_amount_yen <= 0 then raise exception 'zero payout is not allowed'")
    expect(sql).not.toMatch(/p_amount_yen\s*<\s*10000/)
  })

  it('uses one unique payable per sale with atomic skip-locked claims', () => {
    expect(sql).toContain('unique (sale_kind, sale_id)')
    expect(sql).toContain('unique (stripe_transfer_id)')
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('connected account does not belong to performer')
  })

  it('does not backfill historical/AWP sales', () => {
    expect(sql).toContain('Historical sales are intentionally NOT backfilled')
    expect(sql).not.toMatch(/insert into public\.performer_transfer_payables\s+select/i)
    expect(sql).not.toMatch(/update public\.(tips|merch_orders)\s+set automatic_transfer_eligible_at/i)
  })

  it('supports holds, retries, alerts, and refund/dispute reversal states', () => {
    for (const state of ['held', 'retry', 'blocked', 'reversal_pending', 'partially_reversed', 'reversed']) {
      expect(sql).toContain(`'${state}'`)
    }
    expect(sql).toContain('next_retry_at')
    expect(sql).toContain('alert_after')
  })
})

