import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20261013_payout_reservation_and_audit.sql', import.meta.url), 'utf8')
const bankPayoutSql = readFileSync(new URL('../supabase/migrations/20261016101802_connect_bank_payout_ledger.sql', import.meta.url), 'utf8')

describe('payout reservation migration', () => {
  it('is additive and preserves existing sales data', () => {
    expect(sql).not.toMatch(/^\s*(delete\s+from|truncate|drop\s+table)\b/im)
    expect(sql).toContain('create table if not exists public.payout_audit_events')
  })

  it('serializes global and performer reservations and fixes the minimum at 10000 yen', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('haku-platform-transfer-reservation'")
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(p_performer_id::text')
    expect(sql).toMatch(/p_amount_yen < 10000/)
    expect(sql).toContain("status in ('reserved','paid')")
  })

  it('only allocates production platform-held sales to the manual Transfer ledger', () => {
    expect(sql).toContain("stripe_session_id like 'cs_live_%'")
    expect(sql).toContain("stripe_checkout_mode = 'platform_separate'")
    expect(sql).toContain('stripe_account_id = p_connected_account_id')
    expect(sql).toContain('grant execute on function public.reserve_performer_payout')
    expect(sql).toContain('to service_role')
  })

  it('recomputes partial and full refunds inside the locked reservation transaction', () => {
    expect(sql).toContain('create or replace function public.payout_remaining_share_yen')
    expect(sql).toContain('p_refunded_yen >= p_gross_yen')
    expect(sql).toContain('p_gross_yen - p_refunded_yen')
    expect(sql).toContain('refunded_amount_yen')
    expect(sql).toContain('payout_remaining_share_yen(')
  })

  it('stores bank payouts independently without rewriting Transfer allocations', () => {
    expect(bankPayoutSql).toContain('create table if not exists public.connected_account_payouts')
    expect(bankPayoutSql).toContain('unique (connected_account_id, stripe_payout_id)')
    expect(bankPayoutSql).toContain('enable row level security')
    expect(bankPayoutSql).not.toMatch(/alter table public\.performer_payouts/i)
    expect(bankPayoutSql).not.toMatch(/^\s*(delete\s+from|truncate|drop\s+table)\b/im)
  })
})
