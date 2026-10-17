import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('HAKU LIVE release gate', () => {
  it('keeps a dedicated regression command covering media and adjacent revenue safety', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    const gate = pkg.scripts['test:live']
    expect(gate).toContain('live-camera.test.ts')
    expect(gate).toContain('live-comments.test.ts')
    expect(gate).toContain('live-comment-moderation-migration.test.ts')
    expect(gate).toContain('p0-readiness.test.ts')
    expect(gate).toContain('live-end-location.test.ts')
    expect(gate).toContain('payment-safety.test.ts')
    expect(gate).toContain('tip-approval.test.ts')
    expect(gate).toContain('tip-confirmation.test.ts')
  })

  it('requires device evidence and never labels untested devices as passed', () => {
    const runbook = readFileSync('docs/HAKU_LIVE_RELEASE_RUNBOOK.md', 'utf8')
    expect(runbook).toContain('iPhone Safari')
    expect(runbook).toContain('Android Chrome')
    expect(runbook).toContain('PCブラウザ')
    expect(runbook).toContain('前面→背面→前面を10回')
    expect(runbook).toContain('配信者端末Aと視聴者端末B')
    expect(runbook).toContain('未検証')
    expect(runbook).toContain('Vercel Productionのdeployment ID')
  })

  it('defines the P0 rollback symptoms and protects production data and payments', () => {
    const runbook = readFileSync('docs/HAKU_LIVE_RELEASE_RUNBOOK.md', 'utf8')
    expect(runbook).toContain('横長固定、過度なズーム、映像静止、二重映像、操作不能')
    expect(runbook).toContain('本番データ削除は行わない')
    expect(runbook).toContain('Stripe決済')
    expect(runbook).toContain('直前の正常なVercel deploymentへロールバック')
  })
})
