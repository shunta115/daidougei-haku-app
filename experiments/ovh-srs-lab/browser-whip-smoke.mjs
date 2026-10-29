import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--no-sandbox'
  ]
});
const page = await browser.newPage({ permissions: ['camera', 'microphone'] });
let ok = false;
try {
  await page.goto('http://127.0.0.1:4319/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'LIVE配信を開始' }).click();
  await page.waitForFunction(
    () => { const status = document.getElementById('status')?.textContent ?? ''; return status === 'LIVE配信中' || status.startsWith('開始できません'); },
    { timeout: 25000 }
  );
  const status = await page.locator('#status').textContent();
  if (status !== 'LIVE配信中') throw new Error('Browser WHIP: ' + status);
  const dimensions = await page.locator('#preview').evaluate(video => ({
    width: video.videoWidth,
    height: video.videoHeight,
    audioTracks: video.srcObject?.getAudioTracks().length ?? 0
  }));
  if (!dimensions.width || !dimensions.height || !dimensions.audioTracks) {
    throw new Error('Browser did not capture video and audio');
  }
  await new Promise(resolve => setTimeout(resolve, 10000));
  const media = await page.evaluate(() => window.__hakuLabMediaCounters());
  console.log(JSON.stringify({ browserWhipConnected: true, ...dimensions, media }));
  if (!media || media.videoBytes <= 0 || media.audioBytes <= 0 || media.videoFrames <= 0) {
    throw new Error('WHIP connected but no media bytes or video frames were sent');
  }
  ok = true;
  await new Promise(resolve => setTimeout(resolve, 50000));
} finally {
  if (ok) await page.getByRole('button', { name: '配信を終了' }).click().catch(() => {});
  await browser.close();
}
