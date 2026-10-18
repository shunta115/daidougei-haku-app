import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const approval = readFileSync('docs/HAKU_P3_PRODUCTION_DB_APPROVAL.md', 'utf8')
const verifier = readFileSync('scripts/verify-pg-backup.sh', 'utf8')
const auditSql = readFileSync('supabase/audit_production_migration_history_readonly.sql', 'utf8')

describe('P3 production DB approval pack', () => {
  it('pins the reviewed project, migration, and checksum', () => {
    expect(approval).toContain('pmmtijwswzwhuriqhlep')
    expect(approval).toContain('20261016142951_live_comment_moderation.sql')
    expect(approval).toContain('075502b0adde57e2eb40a91a40a4fd3b3274d1bf8048ed59938206c5ffd741c1')
  })

  it('requires integrity and isolated restore checks before approval', () => {
    expect(approval).toContain('shasum -a 256')
    expect(approval).toContain('pg_restore')
    expect(approval).toContain('本番DB変更の明示承認')
    expect(verifier).toContain('pg_restore --list')
    expect(verifier).toContain("grep -q 'POLICY'")
    expect(verifier).toContain("grep -q 'ROW SECURITY'")
  })

  it('keeps the production audit SQL read only', () => {
    expect(auditSql).not.toMatch(/\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i)
    expect(auditSql).toContain('supabase_migrations.schema_migrations')
  })
})
