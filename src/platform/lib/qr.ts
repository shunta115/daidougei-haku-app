import QRCode from 'qrcode'

export async function performerQrDataUrl(url: string, size = 280) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: size,
    color: { dark: '#111111', light: '#ffffff' },
  })
}

export async function downloadQrCard(opts: { url: string; name: string; handle: string }) {
  const src = await performerQrDataUrl(opts.url, 480)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('qr'))
    el.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 900
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 70, 90, 580, 580, 24)
  ctx.fill()
  ctx.drawImage(img, 130, 150, 460, 460)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 36px "Hiragino Sans", "Noto Sans JP", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(opts.name, 360, 740)
  ctx.font = '600 22px "Hiragino Sans", "Noto Sans JP", sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.7)'
  ctx.fillText(`@${opts.handle}`, 360, 780)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('blob'))), 'image/png')
  })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `${opts.handle || 'haku'}-qr.png`
  a.click()
  URL.revokeObjectURL(href)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
