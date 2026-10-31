import { supabaseAuthHeaders } from './supabase'
import type { HomeDetails } from '../../../shared/officialHome'
export type HomeAsset = { id:string; performer_id:string; kind:'photo'|'pdf'|'video'; title:string; description:string; published:boolean; is_main:boolean; sort_order:number; video_id:string|null; updated_at:string; bytes:number }
export type HomeData = { home: { details:HomeDetails; published:boolean } | null; assets:HomeAsset[] }
const endpoint = '/api/ops/inbox?resource=official-home'
export function assetUrl(asset: HomeAsset, thumb = false, download = false) {
  return `${endpoint}&homeAction=file&performerId=${asset.performer_id}&assetId=${asset.id}${thumb ? '&thumb=1' : ''}${download ? '&download=1' : ''}`
}
export async function homeRead(id:string, edit = false): Promise<HomeData> {
  const response = await fetch(`${endpoint}&homeAction=${edit ? 'edit' : 'read'}&performerId=${encodeURIComponent(id)}`, { headers:edit ? await supabaseAuthHeaders() : {} })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || 'ページを読み込めませんでした。'),{ status:response.status })
  return data
}
export async function homeWrite(action:string, payload:Record<string, unknown>, progress?: (n:number)=>void): Promise<Record<string, unknown>> {
  const headers = await supabaseAuthHeaders()
  return new Promise((resolve,reject) => {
    const request = new XMLHttpRequest()
    request.open('POST',endpoint)
    request.timeout = 60000
    request.setRequestHeader('Content-Type','application/json')
    for(const [key,value] of Object.entries(headers)) request.setRequestHeader(key,value)
    request.upload.onprogress = event => { if(event.lengthComputable) progress?.(Math.round(event.loaded/event.total*100)) }
    request.onerror = () => reject(new Error('通信に失敗しました。再試行できます。'))
    request.ontimeout = () => reject(new Error('通信がタイムアウトしました。一覧を確認してから再試行してください。'))
    request.onload = () => {
      let data:Record<string, unknown>
      try { data = JSON.parse(request.responseText) } catch { reject(new Error('応答を確認できませんでした。')); return }
      if(request.status >= 400) reject(new Error(String(data.error || '保存できませんでした。')))
      else resolve(data)
    }
    request.send(JSON.stringify({ ...payload,action }))
  })
}
export function fileBase64(blob:Blob): Promise<string> {
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('ファイルを読み込めませんでした。')); reader.readAsDataURL(blob) })
}
export async function prepareGalleryPhoto(file:File) {
  if(file.size > 30*1024*1024 || !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('30MB以下のJPEG・PNG・WebPを選択してください。HEICは端末で読み込める場合に対応します。')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src=url
    await image.decode().catch(() => { throw new Error('この写真は読み込めません。JPEG形式で選択してください。') })
    if(image.naturalWidth*image.naturalHeight > 80000000) throw new Error('写真の解像度が大きすぎます。')
    const render = async (size:number,quality:number) => {
      const scale = Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight))
      const canvas = document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
      const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('画像処理に失敗しました。')
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height)
      const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality))
      if(!blob || blob.size>2097152) throw new Error('画像を小さくして再試行してください。')
      return fileBase64(blob)
    }
    return { base64:await render(1600,.76),thumbnail:await render(400,.68) }
  } finally { URL.revokeObjectURL(url) }
}
