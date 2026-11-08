// One-shot readiness check for an isolated localhost HLS manifest.
import { validateOptions, mediaPlaylistUrl, segmentUrls } from './hls-local-probe.mjs';

const target = validateOptions({ url: process.argv[2], viewers: 1, seconds: 1 });
async function playlist(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error('HLS unavailable');
  return response.text();
}
try {
  const master = await playlist(target.href);
  const mediaUrl = mediaPlaylistUrl(master, target.href);
  const media = mediaUrl === target.href ? master : await playlist(mediaUrl);
  if (!segmentUrls(media, mediaUrl).length) throw new Error('HLS has no segment');
  console.log('HLS media playlist ready');
} catch {
  process.exitCode = 1;
}
