import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runProbe } from './hls-local-probe.mjs';

// Loopback-only, miniature fake HLS data. This tests the load generator,
// NOT OVHcloud bandwidth, real SRS performance, iPhone decoding, or 500 real viewers.
test('500 synthetic loopback HLS clients fetch segments', async () => {
  const segment = Buffer.alloc(256, 0x47);
  const server = createServer((req, res) => {
    if (req.url === '/live/test.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2.0,\nsegment-001.ts\n');
    } else if (req.url === '/live/segment-001.ts') {
      res.end(segment);
    } else {
      res.statusCode=404;res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:'+server.address().port+'/live/test.m3u8';
  const oldFlag = process.env.HAKU_LOCAL_LOAD_APPROVED;
  process.env.HAKU_LOCAL_LOAD_APPROVED = 'YES';
  try {
    const result = await runProbe({url, viewers:500, seconds:5});
    assert.equal(result.viewersWithFirstSegment,500,JSON.stringify(result));
    assert.equal(result.bytes,500*segment.length);
    assert.equal(result.errors,0);
    assert.equal(result.segments,500);
    assert.ok(result.requestP95Ms!==null);
  } finally {
    if (oldFlag === undefined) delete process.env.HAKU_LOCAL_LOAD_APPROVED;
    else process.env.HAKU_LOCAL_LOAD_APPROVED=oldFlag;
    await new Promise(resolve=>server.close(resolve));
  }
});
