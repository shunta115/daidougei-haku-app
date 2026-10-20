import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20261020112849_automatic_performer_transfers.sql', import.meta.url), 'utf8')
const leaseSql = readFileSync(new URL('../supabase/migrations/20261020114957_harden_payable_claim_lease.sql', import.meta.url), 'utf8')
const grantSql = readFileSync(new URL('../supabase/migrations/20261020130000_grant_transfer_payables_service_role.sql', import.meta.url), 'utf8')

describe('automatic transfer migration', () => {
  it('does not make new tip eligibility depend on nonexistent tip columns', () => {
    const source = readFileSync('api/stripe/tip.ts', 'utf8')
    const patch = source.match(/const tipMetaPatch = \{([\s\S]*?)\n    \}/)?.[1] ?? ''
    expect(patch).toContain('automatic_transfer_eligible_at')
    expect(patch).not.toContain('funding_model')
    expect(patch).not.toContain('transfer_status')
  })

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
    expect(leaseSql).toContain("p.claimed_at <= now() - interval '15 minutes'")
    expect(leaseSql).toContain("hold_reason = 'connect_not_registered'")
    expect(leaseSql).toContain("state = 'ready'")
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

  it('allows only the server role to reconcile the transfer ledger', () => {
    expect(grantSql).toMatch(/grant select, insert, update, delete[\s\S]*to service_role/i)
    expect(grantSql).toMatch(/revoke insert, update, delete[\s\S]*from anon, authenticated/i)
    expect(grantSql).not.toMatch(/grant[\s\S]*to anon|grant[\s\S]*to authenticated/i)
  })
})

