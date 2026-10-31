// Loopback-only SRS control. Never expose SRS HTTP API to a public network.
export function makeSrsLoopback({ port = 1985, fetcher = fetch } = {}) {
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_srs_port');
const BASE = 'http://127.0.0.1:' + port;
const request = async (path, options = {}) => {
  const response = await fetcher(BASE + path, { redirect: 'error', signal: AbortSignal.timeout(5000), ...options });
  if (!response.ok) throw new Error('srs_http_' + response.status);
  const body = await response.json();
  if (body.code !== 0) throw new Error('srs_api_rejected');
  return body;
};
const validStream = stream => /^haku-lab-[a-z0-9]{1,80}$/.test(stream);

async function openSrsWhip({ stream, sdp }) {
  if (!validStream(stream) || typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > 128 * 1024) {
    throw new Error('invalid_whip_request');
  }
  const response = await fetcher(BASE + '/rtc/v1/whip/?app=live&stream=' + stream, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp' },
    body: sdp, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('srs_whip_' + response.status);
  const answer = await response.text();
  if (!answer.startsWith('v=0')) throw new Error('invalid_srs_answer');
  return { answer };
}

async function publisherFor(stream) {
  const result = await request('/api/v1/streams/?start=0&count=100');
  const matches = (result.streams || []).filter(item => item.name === stream && item.app === 'live' && item.publish?.active);
  if (matches.length > 1) throw new Error('ambiguous_srs_publisher');
  return matches[0] || null;
}

async function closeSrsWhip({ stream }) {
  if (!validStream(stream)) throw new Error('invalid_stream');
  const current = await publisherFor(stream);
  if (!current) return;
  const cid = String(current.publish.cid || '');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cid)) throw new Error('invalid_srs_client_id');
  await request('/api/v1/clients/' + cid, { method: 'DELETE' });
  const remaining = await publisherFor(stream);
  if (remaining) throw new Error('srs_disconnect_unconfirmed');
}

return { openSrsWhip, closeSrsWhip };
}

export const { openSrsWhip, closeSrsWhip } = makeSrsLoopback();
