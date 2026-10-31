import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

// The production quality gate should actually execute the isolated Node tests,
// not merely build their source. All endpoints are fixed to localhost.
// This intentionally excludes Docker, paid VPS, and external load tests.
describe('HAKU LIVE isolated SRS/WHIP lab', () => {
  it('passes the localhost-only Node safety and capacity suite', () => {
    const dir = 'experiments/ovh-srs-lab/'
    const files = [
      'capacity.test.mjs',
      'admission.test.mjs',
      'trial-gate.test.mjs',
      'whip-publisher.test.mjs',
      'local-gateway.test.mjs',
      'hls-local-probe.test.mjs',
      'hls-500-synthetic.test.mjs',
    ].map(file => dir + file)
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
      // Each test controls its own explicit local-load opt-in. Never override globally.
      env: { ...process.env, HAKU_LOCAL_LOAD_APPROVED: '' },
    })
    expect(result.error?.message ?? '', result.stderr).toBe('')
    expect(result.status, [result.stdout, result.stderr].join('\n')).toBe(0)
    expect(result.stdout).toMatch(/# fail 0/)
  }, 50000)
})
