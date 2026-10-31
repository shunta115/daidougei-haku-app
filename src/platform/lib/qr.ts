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
  ctx.fillText(opts.name, 360, 740, 580)
  ctx.font = '600 22px "Hiragino Sans", "Noto Sans JP", sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.7)'
  ctx.fillText(`@${opts.handle}`, 360, 780, 580)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('blob'))), 'image/png')
  })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `${opts.handle || 'haku'}-qr.png`
  document.body.appendChild(a)
  try { a.click() }
  finally {
    a.remove()
    // Safari may still be consuming the Blob URL after the click returns.
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
  }
}

export async function printQrCard(opts: { url: string; name: string; handle: string }) {
  const popup = window.open('', '_blank', 'width=760,height=960')
  if (!popup) throw new Error('popup_blocked')
  popup.opener = null
  try {
    const src = await performerQrDataUrl(opts.url, 520)
    if (popup.closed) return
    const doc = popup.document
    doc.title = `${opts.name} HAKU QR`
    const style = doc.createElement('style')
    style.textContent = '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;color:#111}.card{width:150mm;max-width:100%;margin:0 auto;text-align:center;break-inside:avoid}.card img{display:block;width:110mm;height:auto;aspect-ratio:1;max-width:100%;margin:auto}.card h1{margin:8mm 0 2mm;font-size:24pt;line-height:1.2;overflow-wrap:anywhere}.card p{margin:0;font-size:14pt;color:#555;overflow-wrap:anywhere}.print-action{display:block;margin:16px auto;padding:12px 24px;font-size:16px}@page{size:A4 portrait;margin:18mm}@media screen{body{min-height:100vh;display:grid;place-content:center}}@media print{html,body{min-height:0;height:auto}.print-action{display:none}}'
    const card = doc.createElement('main')
    card.className = 'card'
    const image = doc.createElement('img')
    image.alt = ''
    const name = doc.createElement('h1')
    name.textContent = opts.name
    const handle = doc.createElement('p')
    handle.textContent = `@${opts.handle}`
    const printAction = doc.createElement('button')
    printAction.className = 'print-action'
    printAction.type = 'button'
    printAction.textContent = '印刷 / Print'
    printAction.disabled = true
    printAction.addEventListener('click', () => { popup.focus(); popup.print() })
    card.append(image, name, handle)
    doc.head.append(style)
    doc.body.append(card, printAction)
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('qr_print_timeout')), 15_000)
      image.addEventListener('load', () => { window.clearTimeout(timeout); resolve() }, { once: true })
      image.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('qr_print_image')) }, { once: true })
      image.src = src
    })
    if (popup.closed) return
    printAction.disabled = false
    popup.focus()
    // A visible button remains available if Safari suppresses automatic printing.
    try { popup.print() } catch { /* use the print button in the opened card */ }
  } catch (error) {
    if (!popup.closed) popup.close()
    throw error
  }
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
