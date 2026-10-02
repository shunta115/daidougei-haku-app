import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('HAKU admin and public performer safety', () => {
  it('keeps stripe account ids off the browser performer select list', () => {
    const columns = read('src/platform/lib/performerColumns.ts')
    const api = read('src/platform/lib/api.ts')
    expect(columns).not.toMatch(/'stripe_account_id'/)
    expect(api).toMatch(/PERFORMER_CLIENT_SELECT/)
    expect(api).not.toMatch(/from\('performers'\)[\s\S]{0,80}\.select\('\*'\)/)
  })

  it('serves HAKU ADMIN through requireAdmin and does not expose service role to the client', () => {
    const admin = read('api/ops/_hakuAdmin.ts')
    const supabase = read('src/platform/lib/supabase.ts')
    expect(admin).toMatch(/requireAdmin/)
    expect(admin).toMatch(/admin_audit/)
    expect(supabase).toMatch(/ANON_KEY/)
    expect(supabase).not.toMatch(/SERVICE_ROLE/)
  })

  it('sets 15% tip and 8% goods system-use fees without rewriting payment rows', () => {
    const sql = read('supabase/migrations/20261003_haku_security_fees_admin.sql')
    expect(sql).toMatch(/tip_fee_bps', '1500'/)
    expect(sql).toMatch(/merch_fee_bps', '800'/)
    expect(sql).not.toMatch(/update\s+public\.tips/i)
    expect(sql).not.toMatch(/update\s+public\.merch_orders/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(sql).toMatch(/grant select \(/i)
    expect(sql).toMatch(/chosen_role not in \('fan', 'performer'\)/)
  })
})
