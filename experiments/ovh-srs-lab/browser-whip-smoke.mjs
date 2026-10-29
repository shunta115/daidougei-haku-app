import { chromium } from 'playwright';

const browser = await chromium.launch({
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
    () => document.getElementById('status')?.textContent === 'LIVE配信中',
    { timeout: 25000 }
  );
  const dimensions = await page.locator('#preview').evaluate(video => ({
    width: video.videoWidth,
    height: video.videoHeight,
    audioTracks: video.srcObject?.getAudioTracks().length ?? 0
  }));
  if (!dimensions.width || !dimensions.height || !dimensions.audioTracks) {
    throw new Error('Browser did not capture video and audio');
  }
  console.log(JSON.stringify({ browserWhipConnected: true, ...dimensions }));
  ok = true;
  await new Promise(resolve => setTimeout(resolve, 30000));
} finally {
  if (ok) await page.getByRole('button', { name: '配信を終了' }).click().catch(() => {});
  await browser.close();
}
