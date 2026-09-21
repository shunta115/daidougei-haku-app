import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('P0 migration safety', () => {
  it('restricts public signup without rewriting existing users or roles', () => {
    const sql = read('supabase/migrations/20260921_restrict_public_signup_roles.sql')
    expect(sql).toMatch(/begin;/i)
    expect(sql).toMatch(/commit;/i)
    expect(sql).toMatch(/chosen_role not in \('fan', 'performer'\)/i)
    expect(sql).not.toMatch(/update\s+public\.profiles/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('keeps product event names in sync with the client and rolls back on validation failure', () => {
    const sql = read('supabase/migrations/20260910_product_event_kpis.sql')
    const source = read('src/platform/lib/track.ts')
    const union = source.slice(source.indexOf('export type ProductEventName'), source.indexOf('const SID_KEY'))
    const clientNames = [...union.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort()
    const migrationNames = [...sql.matchAll(/^\s*'([^']+)'/gm)].map((match) => match[1]).sort()
    expect(migrationNames).toEqual(clientNames)
    expect(sql).toMatch(/not valid/i)
    expect(sql).toMatch(/validate constraint product_events_name_check/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('keeps event schema additions non-destructive and seed previews rollback-only', () => {
    const migration = read('supabase/migrations/20260921_event_schedule_types.sql')
    const seed = read('supabase/seed_202610_event_template.sql')
    const finalists = read('supabase/assign_202610_finalists_template.sql')
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).toContain("'special_final'")
    expect(migration).toContain('event_slot_id')
    expect(seed.trimEnd().endsWith('rollback;')).toBe(true)
    expect(finalists.trimEnd().endsWith('rollback;')).toBe(true)
    expect(seed).toMatch(/count\(s\.\*\) <> 3/i)
    expect(seed).toContain("'16:00'")
    expect(seed).toContain("'17:00'")
  })
})
