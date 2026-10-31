import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSrsLoopback } from './srs-loopback.mjs';

test('WHIP answer and physical SRS publisher disconnect stay on loopback', async () => {
  let active = true;
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    assert.match(url, /^http:\/\/127\.0\.0\.1:1985\//);
    if (url.includes('/rtc/v1/whip/')) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/sdp');
      return new Response('v=0\r\n', { status: 201 });
    }
    if (url.includes('/api/v1/streams')) return Response.json({
      code: 0, streams: active ? [{ name: 'haku-lab-abc', app: 'live', publish: { active: true, cid: '7' } }] : [],
    });
    if (url.endsWith('/api/v1/clients/7')) {
      assert.equal(options.method, 'DELETE');
      active = false;
      return Response.json({ code: 0 });
    }
    throw new Error('unexpected_request');
  };
  const srs = makeSrsLoopback({ fetcher });
  const media = await srs.openSrsWhip({ stream: 'haku-lab-abc', sdp: 'v=0\r\n' });
  assert.equal(media.answer, 'v=0\r\n');
  await srs.closeSrsWhip({ stream: 'haku-lab-abc' });
  assert.equal(active, false);
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET', 'DELETE', 'GET']);
});

test('SRS disconnect uncertainty and invalid stream fail closed', async () => {
  const srs = makeSrsLoopback({ fetcher: async url => {
    if (url.includes('/api/v1/streams')) return Response.json({
      code: 0, streams: [{ name: 'haku-lab-abc', app: 'live', publish: { active: true, cid: '7' } }],
    });
    return Response.json({ code: 0 });
  } });
  await assert.rejects(srs.closeSrsWhip({ stream: 'haku-lab-abc' }), /srs_disconnect_unconfirmed/);
  await assert.rejects(srs.openSrsWhip({ stream: 'arbitrary', sdp: 'v=0' }), /invalid_whip_request/);
});
