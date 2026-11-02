export type StoryDetails = { name: string; url: string; live: boolean | null }

export function storyStatus(live: boolean | null) {
  return live === null ? 'LIVE情報を確認してください' : live ? 'LIVE中 · 画像作成時点' : 'LIVE終了'
}

/** Local-only artwork: never reads video/audio or uploads viewer data. */
export async function createLiveStory({ name, url, live }: StoryDetails): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像生成に対応していません')
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1920)
  gradient.addColorStop(0, '#092922')
  gradient.addColorStop(1, '#07100e')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1920)
  ctx.fillStyle = '#b8f36c'
  ctx.font = 'bold 64px sans-serif'
  ctx.fillText('HAKU DIRECT', 80, 260)
  ctx.fillStyle = live ? '#ff7373' : '#c2cbc6'
  ctx.font = 'bold 42px sans-serif'
  ctx.fillText(storyStatus(live), 80, 410)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 90px sans-serif'
  const lines: string[] = ['']
  for (const char of Array.from(name)) {
    const i = lines.length - 1
    if (ctx.measureText(lines[i] + char).width > 900) lines.push(char)
    else lines[i] += char
  }
  lines.slice(0, 5).forEach((line, i) => ctx.fillText(line, 80, 640 + i * 115))
  ctx.font = '48px sans-serif'
  ctx.fillText(live ? '一緒にLIVEを楽しもう' : '次のLIVEもお楽しみに', 80, 1330)
  ctx.fillStyle = '#b8f36c'
  ctx.font = '32px sans-serif'
  const urlLines = url.match(/.{1,44}/g) || [url]
  urlLines.forEach((line, i) => ctx.fillText(line, 80, 1470 + i * 46))
  ctx.fillStyle = '#c2cbc6'
  ctx.font = '28px sans-serif'
  ctx.fillText('視聴はストーリーのリンクから', 80, 1720)
  ctx.fillText(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' JST 作成', 80, 1780)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を作成できませんでした')), 'image/png'))
}

export async function copyLiveUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    window.prompt('視聴URLをコピーしてください', url)
    return false
  }
}
