import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib'
import { getAdminSupabase, requireAuthUser } from '../api/stripe/_shared.js'
import { requireAdmin } from '../api/ops/_guard.js'
import { cleanDetails, validateBooking, CASE_STATUSES } from '../shared/officialHome.js'

const BUCKET = 'performer-home-private'
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const escaped = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export async function validatePdf(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString('latin1')
  if (!text.startsWith('%PDF-') || !/%%EOF\s*$/.test(text)) throw new Error('PDF形式の資料を選択してください。')
  if (bytes.length > 2097152) throw new Error('PDFは2MB以下にしてください。')
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true })
  if (!document.getPageCount() || document.getPageCount() > 100) throw new Error('PDFは1〜100ページまでです。')
  const forbidden = new Set(['JS','JavaScript','AA','OpenAction','Launch','EmbeddedFiles','EmbeddedFile','RichMedia','XFA','AcroForm','A','URI','GoToR','SubmitForm','ImportData','GoToE'])
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const check = (obj: unknown, depth = 0): void => {
      if (depth > 50) throw new Error('PDFの構造が複雑すぎます。')
      if (obj instanceof PDFArray) for (const item of obj.asArray()) check(item,depth+1)
      if (obj instanceof PDFStream) check(obj.dict,depth+1)
      if (obj instanceof PDFDict) for (const [key, val] of obj.entries()) {
        if (forbidden.has(key.decodeText()) || (val instanceof PDFName && forbidden.has(val.decodeText()))) throw new Error('フォーム・添付ファイル・スクリプトを含むPDFは登録できません。印刷用PDFで保存してください。')
        check(val, depth + 1)
      }
    }
    check(object)
  }
}
function jpeg(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) throw new Error('JPEG形式の写真を選択してください。')
}
export async function officialHome(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    if (process.env.HOME_ENABLED !== 'true') {
      if (req.query.homeAction === 'page') return res.status(200).setHeader('Content-Type','text/html; charset=utf-8').send(await readFile(`${process.cwd()}/dist/index.html`,'utf8'))
      return res.status(503).json({ error:'公式ページは準備中です。' })
    }
    if (process.env.VERCEL_ENV === 'preview' && new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://invalid').hostname !== 'aeqskxxykzapgaudbeqa.supabase.co') return res.status(503).json({ error:'TEST環境の接続確認が必要です。' })
    if (process.env.VERCEL_ENV === 'preview') res.setHeader('X-Robots-Tag','noindex, nofollow')
    const sb = getAdminSupabase()
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
    const action = String(req.query.homeAction || body.action || 'read')
    if (req.method === 'POST') {
      // Same-origin JSON only; no cross-origin form posts.
      if (!String(req.headers['content-type']).startsWith('application/json')) return res.status(415).json({ error: 'JSON required' })
      if (req.headers.origin && new URL(String(req.headers.origin)).host !== req.headers.host) return res.status(403).json({ error: 'origin rejected' })
    }
    const performerId = String(req.query.performerId || body.performer_id || '')
    if (['read','file','page','booking'].includes(action)) {
      if (!uuid(performerId)) return res.status(400).json({ error: 'invalid performer' })
      const { data: performer } = await sb.from('performers').select('id,stage_name,genre,bio,photo_url,is_approved,is_private_test').eq('id', performerId).maybeSingle()
      const { data: profile } = await sb.from('profiles').select('status').eq('id',performerId).maybeSingle()
      const { data: home, error: homeError } = await sb.from('performer_homepages').select('*').eq('performer_id',performerId).maybeSingle()
      if (homeError) return res.status(503).json({ error: '公式ページは準備中です。しばらくしてからお試しください。' })
      const visible = performer && performer.is_approved && !performer.is_private_test && profile?.status === 'active' && home?.published !== false
      if (!visible) { res.setHeader('X-Robots-Tag','noindex'); return res.status(404).json({ error: 'ページは公開されていません。' }) }
      if (action === 'file' && req.method === 'GET') {
        if (!uuid(req.query.assetId)) return res.status(404).end()
        const { data: asset } = await sb.from('performer_home_assets').select('*').eq('id',req.query.assetId).eq('performer_id',performerId).eq('published',true).maybeSingle()
        if (!asset || asset.kind === 'video') return res.status(404).end()
        const path = req.query.thumb === '1' && asset.thumbnail_path ? asset.thumbnail_path : asset.object_path
        const { data, error } = await sb.storage.from(BUCKET).download(path)
        if (error || !data) return res.status(404).end()
        res.setHeader('Content-Type', asset.kind === 'pdf' ? 'application/pdf' : 'image/jpeg')
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
        if (asset.kind === 'pdf') res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="press-kit.pdf"; filename*=UTF-8''${encodeURIComponent(asset.title.replace(/[\r\n/\\]/g,'_').slice(0,100) + '.pdf')}`)
        return res.status(200).send(Buffer.from(await data.arrayBuffer()))
      }
      const { data: assets, error } = await sb.from('performer_home_assets').select('*').eq('performer_id',performerId).eq('published',true).order('sort_order')
      if (error) throw error
      if (action === 'page' && req.method === 'GET') {
        const origin = process.env.PUBLIC_SITE_URL
        if (!origin || !/^https:\/\/[a-z0-9.-]+$/i.test(origin)) return res.status(503).send('Canonical URL is not configured')
        const canonical = `${origin}/performer/${performerId}`
        const title = `${performer.stage_name}｜公式プロフィール・出演依頼｜HAKU`
        const description = String(home?.details?.tagline || performer.bio || performer.genre || '').slice(0,160)
        const main = assets?.find(a => a.kind === 'photo' && a.is_main) || assets?.find(a => a.kind === 'photo')
        const image = main ? `${origin}/api/ops/inbox?resource=official-home&homeAction=file&performerId=${performerId}&assetId=${main.id}` : performer.photo_url
        const schema = { '@context': 'https://schema.org', '@type': 'ProfilePage', url:canonical, mainEntity:{ '@type':'Person', name:performer.stage_name, description, ...(image ? { image } : {}) } }
        const metadata = `<title>${escaped(title)}</title><meta name="description" content="${escaped(description)}"><link rel="canonical" href="${escaped(canonical)}"><meta property="og:title" content="${escaped(title)}"><meta property="og:description" content="${escaped(description)}"><meta property="og:type" content="profile"><meta property="og:url" content="${escaped(canonical)}">${image ? `<meta property="og:image" content="${escaped(image)}">` : ''}<meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`
        let html = await readFile(`${process.cwd()}/dist/index.html`, 'utf8')
        html = html.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta[^>]+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi,'')
        return res.status(200).setHeader('Content-Type','text/html; charset=utf-8').send(html.replace('</head>', `${metadata}</head>`))
      }
      if (action === 'booking' && req.method === 'POST') {
        if (body.website || typeof body.started_at !== 'number' || Date.now() - body.started_at < 3000 || Date.now()-body.started_at > 86400000) return res.status(400).json({ error: '入力を確認して再送信してください。' })
        const payload = validateBooking(body.payload)
        if (payload.performer_id !== performerId) return res.status(400).end()
        const salt = process.env.BOOKING_RATE_LIMIT_SECRET
        if (!salt || salt.length < 32) return res.status(503).json({ error: '出演依頼の受付は準備中です。' })
        // Vercel overwrites this header at its trusted edge; fail closed elsewhere.
        const ip = process.env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim() : process.env.HOME_TEST_IP
        if (!ip) return res.status(503).json({ error: '受付の接続確認に失敗しました。' })
        const key = createHash('sha256').update(`${salt}:${ip}`).digest('hex')
        const { data: id, error: bookingError } = await sb.rpc('home_submit_booking',{ p_payload:payload, p_key:key })
        if (bookingError) return res.status(503).json({ error: '受付を完了できませんでした。時間をおいてお試しください。' })
        if (!id) return res.status(429).json({ error: '送信回数が上限に達しました。1時間後にお試しください。' })
        return res.status(201).json({ id })
      }
      if (req.method !== 'GET' || action !== 'read') return res.status(405).end()
      return res.json({ home, assets })
    }
    if (action === 'cases') {
      const admin = await requireAdmin(req,res)
      if (!admin) return
      if (req.method !== 'POST') return res.status(405).end()
      if (body.id && (!uuid(body.id) || !Object.hasOwn(CASE_STATUSES,String(body.status)))) return res.status(400).end()
      const { data, error } = await sb.rpc('home_manage_cases',{ p_id:body.id || null,p_status:body.status || null,p_query:String(body.query || '').slice(0,120),p_filter: Object.hasOwn(CASE_STATUSES,String(body.filter)) ? body.filter : '' })
      if (error) throw error
      return res.json({ cases:data })
    }
    const user = await requireAuthUser(req,res)
    if (!user) return
    // Ownership comes exclusively from the verified session, never the submitted id.
    if (performerId && performerId !== user.id) return res.status(403).end()
    const { data: owner } = await sb.from('profiles').select('role,status').eq('id',user.id).maybeSingle()
    const { data: performer } = await sb.from('performers').select('id').eq('id',user.id).maybeSingle()
    if (!performer || owner?.role !== 'performer' || owner.status !== 'active') return res.status(403).end()
    if (action === 'preview-file' && req.method === 'GET') {
      if (!uuid(req.query.assetId)) return res.status(404).end()
      const { data: asset } = await sb.from('performer_home_assets').select('*').eq('id',req.query.assetId).eq('performer_id',user.id).maybeSingle()
      if (!asset || asset.kind === 'video') return res.status(404).end()
      const { data,error } = await sb.storage.from(BUCKET).download(asset.thumbnail_path || asset.object_path)
      if(error || !data) return res.status(404).end()
      res.setHeader('Content-Type',asset.kind === 'pdf' ? 'application/pdf':'image/jpeg')
      return res.status(200).send(Buffer.from(await data.arrayBuffer()))
    }
    if (action === 'edit' && req.method === 'GET') {
      const [home, assets] = await Promise.all([sb.from('performer_homepages').select('*').eq('performer_id',user.id).maybeSingle(),sb.from('performer_home_assets').select('*').eq('performer_id',user.id).order('sort_order')])
      if (home.error || assets.error) return res.status(503).json({ error: '公式ページの編集は準備中です。' })
      return res.json({ home:home.data, assets:assets.data })
    }
    if (req.method !== 'POST') return res.status(405).end()
    if (action === 'save') {
      if (typeof body.published !== 'boolean') return res.status(400).end()
      const { error } = await sb.from('performer_homepages').upsert({ performer_id:user.id,details:cleanDetails(body.details),published:body.published,updated_at:new Date().toISOString() })
      if (error) throw error
      return res.json({ ok:true })
    }
    if (action === 'upload') {
      const kind = String(body.kind)
      if (!['photo','pdf','video'].includes(kind)) return res.status(400).end()
      const id = uuid(body.upload_id) ? body.upload_id : randomUUID()
      const { data: existing } = await sb.from('performer_home_assets').select('*').eq('id',id).eq('performer_id',user.id).maybeSingle()
      if(existing) return res.status(200).json({ asset:existing })
      if(body.replace_id && !uuid(body.replace_id)) return res.status(400).end()
      const title = String(body.title || '').trim().slice(0,160)
      if (!title) throw new Error('資料名・写真名・動画タイトルを入力してください。')
      const paths: string[] = []
      const row: Record<string, unknown> = { id,performer_id:user.id,kind,title,...(body.replace_id ? { replace_id:body.replace_id } : {}) }
      if (kind === 'video') {
        if (!/^[A-Za-z0-9_-]{11}$/.test(String(body.video_id))) throw new Error('YouTubeの動画URLを確認してください。')
        row.video_id = body.video_id
      } else {
        if (typeof body.base64 !== 'string' || body.base64.length > 2796204 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) throw new Error('ファイルは2MB以下にしてください。')
        const bytes = Buffer.from(body.base64,'base64')
        if (!bytes.length || bytes.length > 2097152) throw new Error('ファイルは2MB以下にしてください。')
        if (kind === 'pdf') await validatePdf(bytes); else jpeg(bytes)
        row.object_path = `${user.id}/${id}.${kind === 'pdf' ? 'pdf' : 'jpg'}`
        row.bytes = bytes.length
        const { error } = await sb.storage.from(BUCKET).upload(String(row.object_path),bytes,{ contentType:kind === 'pdf' ? 'application/pdf' : 'image/jpeg',upsert:false })
        if (error) throw error
        paths.push(String(row.object_path))
        if (kind === 'photo') {
          try {
            if (typeof body.thumbnail !== 'string' || body.thumbnail.length > 150000) throw new Error('サムネイルを生成し直してください。')
            const thumb = Buffer.from(body.thumbnail,'base64'); jpeg(thumb)
            row.thumbnail_path = `${user.id}/${id}-thumb.jpg`
            const { error: te } = await sb.storage.from(BUCKET).upload(String(row.thumbnail_path),thumb,{ contentType:'image/jpeg',upsert:false })
            if (te) throw te
            paths.push(String(row.thumbnail_path))
          } catch(e) { await sb.storage.from(BUCKET).remove(paths); throw e }
        }
      }
      const { data,error } = await sb.rpc('home_add_asset',{ p_row:row })
      if (error) { if(paths.length) await sb.storage.from(BUCKET).remove(paths); throw error }
      const replaced = (data.replaced_paths || []).filter((path:unknown) => typeof path === 'string' && path.startsWith(`${user.id}/`))
      if(replaced.length) await sb.storage.from(BUCKET).remove(replaced)
      delete data.replaced_paths
      return res.status(201).json({ asset:data })
    }
    if (action === 'reorder') {
      if (!Array.isArray(body.ids) || !body.ids.every(uuid) || !['photo','pdf','video'].includes(String(body.kind))) return res.status(400).end()
      const {error} = await sb.rpc('home_reorder_assets',{p_performer:user.id,p_kind:body.kind,p_ids:body.ids})
      if(error) throw error
      return res.json({ok:true})
    }
    if (!uuid(body.id)) return res.status(400).end()
    const { data: asset } = await sb.from('performer_home_assets').select('*').eq('id',body.id).eq('performer_id',user.id).maybeSingle()
    if (!asset) return res.status(404).end()
    if (action === 'delete') {
      const paths = [asset.object_path,asset.thumbnail_path].filter(Boolean) as string[]
      if (paths.length) { const { error } = await sb.storage.from(BUCKET).remove(paths); if(error) throw error }
      const { error } = await sb.from('performer_home_assets').delete().eq('id',asset.id).eq('performer_id',user.id)
      if(error) throw error
      return res.json({ ok:true })
    }
    if (action === 'asset') {
      if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160)) throw new Error('名称は1〜160文字で入力してください。')
      if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 2000)) throw new Error('説明は2000文字以内で入力してください。')
      const patch: Record<string, unknown> = { updated_at:new Date().toISOString() }
      if (typeof body.published === 'boolean') patch.published = body.published
      if (typeof body.title === 'string' && body.title.trim() && body.title.length <= 160) patch.title = body.title.trim()
      if (typeof body.description === 'string' && body.description.length <= 2000) patch.description = body.description
      if (typeof body.sort_order === 'number' && Number.isInteger(body.sort_order) && Math.abs(body.sort_order) < 10000) patch.sort_order = body.sort_order
      if (body.is_main === true) {
        const { error } = await sb.rpc('home_set_main',{p_performer:user.id,p_id:asset.id})
        if(error) throw error
        patch.is_main = true
      }
      const { error } = await sb.from('performer_home_assets').update(patch).eq('id',asset.id).eq('performer_id',user.id)
      if(error) throw error
      return res.json({ ok:true })
    }
    return res.status(400).end()
  } catch(e) {
    // No personal information, storage paths, or service details in logs/responses.
    const safe = e instanceof Error && /[\u3040-\u30ff]/.test(e.message) ? e.message : '処理を完了できませんでした。もう一度お試しください。'
    return res.status(400).json({ error:safe })
  }
}
