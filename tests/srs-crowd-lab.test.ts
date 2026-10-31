import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('SRS crowd publish authority', () => {
  it('passes isolated PR87 grant-to-SRS gating tests', () => {
    const result = spawnSync(process.execPath, [
      '--test', '--test-reporter=tap', 'experiments/srs-crowd-lab/publish-gate.test.mjs',
    ], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
      maxBuffer: 1024 * 1024,
    })
    expect(result.error?.message ?? '', result.stderr).toBe('')
    expect(result.status, [result.stdout, result.stderr].join('\n')).toBe(0)
    expect(result.stdout).toMatch(/# fail 0/)
  }, 20000)
})
