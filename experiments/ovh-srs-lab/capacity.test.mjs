// Zero-network regression checks for the capacity planning utility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function simulate(...args) {
  const result = spawnSync(process.execPath, [new URL('./capacity.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);
}

test('500 simultaneous viewers at 800k video + 48k audio and 15% overhead', () => {
  const r = simulate();
  near(r.downstreamMbps, 487.6);
  near(r.gigabytesPerHour, 219.42);
  near(r.monthlyTerabytes, 19.7478);
  assert.equal(r.verified500Viewers, false);
});
test('20 simultaneous live rooms are not a single 500-viewer stream', () => {
  const r = simulate('--simultaneous-streams=20');
  near(r.peakMbps, 9752);
});
test('5 viewers consume 1/100 the single-room bandwidth', () => {
  const r = simulate('--viewers=5');
  near(r.downstreamMbps, 4.876);
});
test('reject unknown settings and invalid viewer count', () => {
  for (const args of [['--foo=3'], ['--viewers=-1'], ['--viewers=5.5']]) {
    const r = spawnSync(process.execPath, [new URL('./capacity.mjs', import.meta.url).pathname, ...args], { encoding:'utf8' });
    assert.notEqual(r.status, 0);
  }
});
