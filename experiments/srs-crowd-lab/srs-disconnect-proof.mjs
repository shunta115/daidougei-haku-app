// Runs only against localhost SRS in the isolated GitHub Actions job.
import { closeSrsWhip } from './srs-loopback.mjs';

const stream = 'haku-lab-revokeproof';
const base = 'http://127.0.0.1:1985';
const find = async () => {
  const response = await fetch(base + '/api/v1/streams?start=0&count=100', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('srs_streams_unavailable');
  const data = await response.json();
  if (data.code !== 0) throw new Error('srs_streams_rejected');
  return (data.streams || []).find(item => item.name === stream && item.app === 'live' && item.publish?.active);
};
let found = false;
for (let i = 0; i < 30; i++) {
  if (await find()) { found = true; break; }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!found) throw new Error('test_publisher_not_found');
await closeSrsWhip({ stream });
if (await find()) throw new Error('test_publisher_still_active');
console.log('SRS publisher physically disconnected on loopback');
