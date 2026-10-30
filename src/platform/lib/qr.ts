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

export async function printQrCard(opts: { url: string; name: string; handle: string }) {
  const popup = window.open('', '_blank', 'width=760,height=960')
  if (!popup) throw new Error('popup_blocked')
  popup.opener = null
  const src = await performerQrDataUrl(opts.url, 520)
  const doc = popup.document
  doc.title = `${opts.name} HAKU QR`
  const style = doc.createElement('style')
  style.textContent = 'body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;color:#111}.card{width:150mm;text-align:center}.card img{width:110mm;height:110mm}.card h1{margin:8mm 0 2mm;font-size:24pt}.card p{margin:0;font-size:14pt;color:#555}@page{size:A4;margin:18mm}'
  const card = doc.createElement('main')
  card.className = 'card'
  const image = doc.createElement('img')
  image.alt = ''
  const name = doc.createElement('h1')
  name.textContent = opts.name
  const handle = doc.createElement('p')
  handle.textContent = `@${opts.handle}`
  card.append(image, name, handle)
  doc.head.append(style)
  doc.body.append(card)
  image.addEventListener('load', () => { popup.focus(); popup.print() }, { once: true })
  image.src = src
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
