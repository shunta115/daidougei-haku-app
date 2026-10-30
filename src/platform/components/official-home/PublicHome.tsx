import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Mail, Play, X } from 'lucide-react'
import { HOME_FIELDS, REQUEST_FIELDS, validateBooking, type BookingInput, type HomeDetails } from '../../../../shared/officialHome'
import { assetUrl, homeWrite, type HomeAsset } from '../../lib/officialHome'
import { parseYouTubeLiveReference, youtubeEmbedUrl } from '../../lib/youtubeLive'
import './official-home.css'

export function HomeGallery({ photos, fallback, name, hero = false }: { photos:HomeAsset[]; fallback?:string|null; name:string; hero?:boolean }) {
  const ordered = [...photos].sort((a,b)=>Number(b.is_main)-Number(a.is_main)||a.sort_order-b.sort_order)
  const [index,setIndex]=useState(0)
  const [open,setOpen]=useState(false)
  const start=useRef(0)
  const previous=useRef<HTMLElement|null>(null)
  const close=useRef<HTMLButtonElement>(null)
  const count=ordered.length || (fallback ? 1 : 0)
  const move=(n:number)=>setIndex(v=>(v+n+count)%count)
  useEffect(()=>{setIndex(0)},[photos.map(p=>p.id).join(',')])
  useEffect(()=>{
    if(!open) return
    previous.current=document.activeElement as HTMLElement
    close.current?.focus()
    const overflow=document.body.style.overflow; document.body.style.overflow='hidden'
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape') setOpen(false)
      if(e.key==='ArrowRight') move(1)
      if(e.key==='ArrowLeft') move(-1)
      if(e.key==='Tab') {
        const buttons=close.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button')
        if(!buttons?.length) return
        const first=buttons[0],last=buttons[buttons.length-1]
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener('keydown',key)
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous.current?.focus()}
  },[open,count])
  if(!count) return null
  const current=ordered[index] || ordered[0]
  const src=current ? assetUrl(current) : fallback!
  const swipe=(x:number)=>{ if(Math.abs(x-start.current)>40) move(x<start.current ? 1:-1) }
  return <div className={`oh-gallery ${hero?'oh-gallery--hero':''}`}>
    {hero ? <>
      <button className="oh-cover" aria-label={`${name}の写真を拡大`} onClick={()=>setOpen(true)} onTouchStart={e=>{start.current=e.touches[0].clientX}} onTouchEnd={e=>swipe(e.changedTouches[0].clientX)}><img src={src} alt={current?.title || name} /></button>
      {count>1 ? <div className="oh-carousel"><button onClick={()=>move(-1)} aria-label="前の写真"><ChevronLeft/></button><span aria-live="polite">{index+1} / {count}</span><button onClick={()=>move(1)} aria-label="次の写真"><ChevronRight/></button></div>:null}
      <div className="oh-thumbs">{ordered.map((a,i)=><button key={a.id} aria-label={`${a.title}を表示`} aria-pressed={index===i} onClick={()=>setIndex(i)}><img src={assetUrl(a,true)} alt="" loading="lazy" /></button>)}</div>
    </> : <div className="oh-photo-grid">{ordered.map((a,i)=><button key={a.id} onClick={()=>{setIndex(i);setOpen(true)}} aria-label={`${a.title}を拡大`}><img src={assetUrl(a,true)} alt={a.title} loading="lazy" /></button>)}</div>}
    {open ? <div role="dialog" aria-modal="true" aria-label="写真の拡大表示" className="oh-lightbox" onTouchStart={e=>{start.current=e.touches[0].clientX}} onTouchEnd={e=>swipe(e.changedTouches[0].clientX)}>
      <button ref={close} className="oh-close" onClick={()=>setOpen(false)} aria-label="閉じる"><X/></button><img src={src} alt={current?.title||name}/><div><button onClick={()=>move(-1)} aria-label="前の写真"><ChevronLeft/></button><span>{index+1} / {count}</span><button onClick={()=>move(1)} aria-label="次の写真"><ChevronRight/></button></div>
    </div>:null}
  </div>
}
export function HomeDetailsView({ details }: { details:HomeDetails }) {
  return <dl className="oh-details">{Object.entries(HOME_FIELDS).map(([key,label])=> details[key as keyof HomeDetails] ? <div key={key}><dt>{label}</dt><dd>{details[key as keyof HomeDetails]}</dd></div> : null)}</dl>
}
export function PublicHomeSections({ assets, details, legacyVideo, activeTab = 'all' }: { assets:HomeAsset[];details:HomeDetails;legacyVideo?:string|null;activeTab?:string }) {
  const [playing,setPlaying]=useState<string|null>(null)
  const photos=assets.filter(a=>a.kind==='photo')
  const pdfs=assets.filter(a=>a.kind==='pdf')
  const videos=assets.filter(a=>a.kind==='video').sort((a,b)=>Number(b.is_main)-Number(a.is_main)||a.sort_order-b.sort_order)
  const legacy=legacyVideo ? parseYouTubeLiveReference(legacyVideo) : null
  return <>
    {photos.length ? <section id="oh-photos" className="oh-section" hidden={activeTab!=='all'&&activeTab!=='photos'}><p className="oh-eyebrow">PHOTO GALLERY</p><h2>写真</h2><HomeGallery photos={photos} name="パフォーマンス"/></section>:null}
    {videos.length || legacy ? <section id="oh-videos" className="oh-section" hidden={activeTab!=='all'&&activeTab!=='videos'}><p className="oh-eyebrow">PERFORMANCE FILMS</p><h2>動画</h2><div className="oh-videos">{(videos.length ? videos : [{id:'legacy',video_id:legacy!.videoId,title:'パフォーマンス動画'}]).map(a=><div key={a.id}>{playing===a.video_id ? <iframe title={a.title} src={youtubeEmbedUrl(a.video_id!,window.location.origin)} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button onClick={()=>setPlaying(a.video_id)} aria-label={`${a.title}を再生`}><img src={`https://i.ytimg.com/vi/${a.video_id}/hqdefault.jpg`} alt="" loading="lazy"/><Play/></button>}<h3>{a.title}</h3></div>)}</div></section>:null}
    {Object.values(details).some(Boolean) ? <section id="oh-profile" className="oh-section" hidden={activeTab!=='all'&&activeTab!=='profile'}><p className="oh-eyebrow">PROFILE & SHOW</p><h2>プロフィール・出演条件</h2><HomeDetailsView details={details}/></section>:null}
    {pdfs.length ? <section id="oh-documents" className="oh-section" hidden={activeTab!=='all'&&activeTab!=='documents'}><p className="oh-eyebrow">PRESS KIT</p><h2>宣材資料</h2><div className="oh-documents">{pdfs.map(a=><article key={a.id}><span>PDF</span><div><h3>{a.title}</h3>{a.description?<p>{a.description}</p>:null}<small>更新 {new Date(a.updated_at).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})} · {(a.bytes/1048576).toFixed(1)} MB</small></div><a className="oh-button oh-button--outline" href={assetUrl(a,false,true)}><Download size={18}/>ダウンロード</a><a href={assetUrl(a)} target="_blank" rel="noopener noreferrer">表示</a></article>)}</div></section>:null}
  </>
}
export function BookingForm({ performerId, name, onClose }: { performerId:string;name:string;onClose:()=>void }) {
  const [values,setValues]=useState<Record<string,string>>({})
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState('')
  const [started]=useState(Date.now)
  const dialog=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const old=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){
      const elements=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([tabindex="-1"]),textarea,a[href]');if(!elements?.length)return
      if(e.shiftKey&&document.activeElement===elements[0]){e.preventDefault();elements[elements.length-1].focus()}
      else if(!e.shiftKey&&document.activeElement===elements[elements.length-1]){e.preventDefault();elements[0].focus()}
    }}
    document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);old?.focus()}
  },[busy])
  return <div className="oh-modal"><div ref={dialog} className="oh-booking" role="dialog" aria-modal="true" aria-labelledby="oh-booking-title"><button className="oh-dismiss" onClick={onClose} disabled={busy} aria-label="閉じる"><X/></button>
    {done ? <div role="status"><p className="oh-eyebrow">THANK YOU</p><h2>出演依頼を受け付けました</h2><p>HAKU事務局が内容を確認し、ご連絡します。</p><p>受付番号：{done}</p><button className="oh-button" onClick={onClose}>プロフィールへ戻る</button></div> : <>
      <p className="oh-eyebrow">BOOKING / HAKU OFFICE</p><h2 id="oh-booking-title">出演について相談する</h2><p>ご依頼はHAKU事務局が受け付けます。事務局が確認後、出演者へ連絡します。</p>
      <form onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');setBusy(true);try{const payload=validateBooking({...values,notes:values.notes||'',performer_id:performerId} as BookingInput);const result=await homeWrite('booking',{performer_id:performerId,payload,started_at:started,website:values.website||''});setDone(String(result.id))}catch(e){setError(e instanceof Error?e.message:'送信に失敗しました。')}finally{setBusy(false)}}}>
        <label>希望パフォーマー<input value={name} readOnly/></label>
        {Object.entries(REQUEST_FIELDS).map(([key,label])=><label key={key}>{label}{key!=='notes'?' *':''}{key==='event'||key==='notes'?<textarea required={key!=='notes'} maxLength={4000} value={values[key]||''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>:<input required maxLength={250} type={key==='email'?'email':key==='phone'?'tel':key==='date'?'date':'text'} autoComplete={key==='email'?'email':key==='phone'?'tel':key==='contact'?'name':key==='organization'?'organization':'off'} value={values[key]||''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>}</label>)}
        <label className="oh-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={values.website||''} onChange={e=>setValues(v=>({...v,website:e.target.value}))}/></label>
        <p>入力情報は出演依頼への対応のために事務局で取り扱います。公開ページには掲載されません。</p>
        {error?<p role="alert" className="oh-error">{error}</p>:null}<button className="oh-button" disabled={busy}><Mail size={18}/>{busy?'送信中…':'HAKU事務局へ送信'}</button>
      </form>
    </>}
  </div></div>
}
