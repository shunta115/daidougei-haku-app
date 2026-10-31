import { useEffect, useState } from 'react'
import { HOME_FIELDS, type HomeDetails } from '../../../../shared/officialHome'
import { assetUrl, fileBase64, homeRead, homeWrite, prepareGalleryPhoto, type HomeAsset } from '../../lib/officialHome'
import { supabaseAuthHeaders } from '../../lib/supabase'
import { parseYouTubeLiveReference } from '../../lib/youtubeLive'
import { HomeDetailsView } from './PublicHome'
import './official-home.css'

function OwnerThumbnail({asset}:{asset:HomeAsset}) {
  const [url,setUrl]=useState('')
  useEffect(()=>{
    let alive=true;let objectUrl=''
    void(async()=>{const response=await fetch(assetUrl(asset,true).replace('homeAction=file','homeAction=preview-file'),{headers:await supabaseAuthHeaders()});if(!response.ok)return;objectUrl=URL.createObjectURL(await response.blob());if(alive)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl)})().catch(()=>undefined)
    return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[asset.id])
  return url?<img className="oh-owner-thumb" src={url} alt={asset.title}/>:<span>写真</span>
}
type Task={ id:string;file:File;kind:'photo'|'pdf';progress:number;state:'waiting'|'uploading'|'done'|'failed';error?:string;replace?:HomeAsset }
export function HomeEditor({performerId}:{performerId:string}) {
  const [details,setDetails]=useState<HomeDetails>({});const [published,setPublished]=useState(true)
  const [assets,setAssets]=useState<HomeAsset[]>([]);const [tasks,setTasks]=useState<Task[]>([])
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [ready,setReady]=useState(false)
  const [preview,setPreview]=useState(false);const [video,setVideo]=useState('');const [title,setTitle]=useState('');const [dragged,setDragged]=useState<string|null>(null)
  const load=async()=>{const data=await homeRead(performerId,true);setAssets(data.assets);return data}
  useEffect(()=>{let alive=true;homeRead(performerId,true).then(data=>{if(alive){setDetails(data.home?.details||{});setPublished(data.home?.published!==false);setAssets(data.assets);setReady(true)}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[performerId])
  const act=async(operation:()=>Promise<unknown>, success='保存しました。')=>{if(busy)return;setBusy(true);setError('');setMessage('');try{await operation();await load();setMessage(success)}catch(e){setError(e instanceof Error?e.message:'保存に失敗しました。')}finally{setBusy(false)}}
  const run=async(task:Task)=>{
    const update=(patch:Partial<Task>)=>setTasks(t=>t.map(x=>x.id===task.id?{...x,...patch}:x))
    update({state:'uploading',progress:0,error:''})
    try {
      const prepared=task.kind==='photo'?await prepareGalleryPhoto(task.file):{base64:await fileBase64(task.file)}
      await homeWrite('upload',{kind:task.kind,title:task.replace?.title||task.file.name.replace(/\.[^.]+$/,''),upload_id:task.id,replace_id:task.replace?.id,...prepared},n=>update({progress:n}))
      update({state:'done',progress:100});await load()
    }catch(e){update({state:'failed',error:e instanceof Error?e.message:'アップロードに失敗しました。'})}
  }
  const upload=async(files:FileList|null,kind:'photo'|'pdf',replace?:HomeAsset)=>{
    if(!files?.length||busy)return
    const chosen=Array.from(files)
    const max=kind==='photo'?20:5
    if(assets.filter(a=>a.kind===kind).length+chosen.length-(replace?1:0)>max){setError(`${kind==='photo'?'写真は20枚':'PDFは5件'}までです。上限時は1件削除してから登録してください。`);return}
    if(kind==='pdf'&&chosen.some(f=>f.size>2097152||!f.name.toLowerCase().endsWith('.pdf'))){setError('PDFは1件2MB以下のPDFファイルを選択してください。');return}
    const pending=chosen.map(file=>({id:crypto.randomUUID(),file,kind,progress:0,state:'waiting' as const,replace}))
    setTasks(t=>[...t,...pending]);setBusy(true);setError('')
    for(const task of pending)await run(task)
    setBusy(false)
  }
  const move=async(id:string,target:string)=>{
    const source=assets.find(a=>a.id===id),destination=assets.find(a=>a.id===target)
    if(!source||!destination||source.kind!==destination.kind||busy||id===target)return
    const group=assets.filter(a=>a.kind===source.kind);const reordered=group.filter(a=>a.id!==id);reordered.splice(reordered.findIndex(a=>a.id===target),0,source)
    await act(()=>homeWrite('reorder',{kind:source.kind,ids:reordered.map(a=>a.id)}),'表示順を保存しました。')
  }
  return <section className="oh-editor"><p className="oh-eyebrow">YOUR OFFICIAL HOMEPAGE</p><h2>公式ホームページを編集</h2><p>写真・動画・宣材PDF・出演条件をまとめて届けましょう。追加した資料は、公開するまで本人だけが確認できます。</p>
    {error?<p className="oh-error" role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
    {!ready?null:<>
      <details open><summary>プロフィール・出演条件</summary><form onSubmit={e=>{e.preventDefault();void act(()=>homeWrite('save',{details,published}))}}>
        <fieldset disabled={busy}><label className="oh-check"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>公式ページを公開する</label>
        {Object.entries(HOME_FIELDS).map(([key,label])=><label key={key}>{label}<textarea maxLength={4000} rows={key==='introduction'?5:2} value={details[key as keyof HomeDetails]||''} onChange={e=>{setDetails(d=>({...d,[key]:e.target.value}));setMessage('')}}/></label>)}
        <div className="oh-actions"><button type="button" className="oh-button oh-button--outline" onClick={()=>setPreview(v=>!v)}>保存前プレビュー</button><button className="oh-button">プロフィールを保存</button></div></fieldset>
      </form>{preview?<div className="oh-preview"><p>公開状態：{published?'公開':'非公開'}</p><HomeDetailsView details={details}/></div>:null}</details>
      <details open><summary>写真 {assets.filter(a=>a.kind==='photo').length} / 20</summary><p>複数選択に対応。写真カードをドラッグするか、「前へ・後へ」でタッチ操作でも並び替えできます。</p><label className="oh-upload">写真を追加<input disabled={busy} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e=>{void upload(e.target.files,'photo');e.target.value=''}}/></label></details>
      <details><summary>宣材PDF {assets.filter(a=>a.kind==='pdf').length} / 5</summary><p>1件2MB以下・100ページまで。フォーム・添付ファイル・スクリプトを含まない印刷用PDFを選んでください。</p><label className="oh-upload">PDFを追加<input disabled={busy} type="file" multiple accept="application/pdf,.pdf" onChange={e=>{void upload(e.target.files,'pdf');e.target.value=''}}/></label></details>
      <details><summary>YouTube動画 {assets.filter(a=>a.kind==='video').length} / 10</summary><form onSubmit={e=>{e.preventDefault();const reference=parseYouTubeLiveReference(video);if(!reference){setError('YouTubeの動画URL・動画IDを確認してください。');return}void act(async()=>{await homeWrite('upload',{kind:'video',title,video_id:reference.videoId});setVideo('');setTitle('')})}}><label>動画タイトル<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>YouTube URL / 動画ID<input required value={video} onChange={e=>setVideo(e.target.value)}/></label><button className="oh-button" disabled={busy}>動画を追加</button></form></details>
      <div className="oh-tasks" aria-live="polite">{tasks.map(task=><div key={task.id}><strong>{task.file.name}</strong><span>{task.state==='done'?'完了':task.state==='failed'?'失敗':task.state==='waiting'?'待機中':`${task.progress}%${task.progress===100?' 検証中…':''}`}</span>{task.state==='uploading'?<progress value={task.progress} max={100}/>:null}{task.error?<><p>{task.error}</p><button disabled={busy} onClick={()=>void act(()=>run(task),'再試行が完了しました。一覧をご確認ください。')}>再試行</button></>:null}</div>)}</div>
      <div className="oh-assets">{assets.map(asset=>{const group=assets.filter(a=>a.kind===asset.kind);const index=group.findIndex(a=>a.id===asset.id);return <article key={asset.id} draggable={!busy&&asset.kind==='photo'} onDragStart={()=>setDragged(asset.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged)void move(dragged,asset.id);setDragged(null)}}>
        {asset.kind==='photo'?<OwnerThumbnail asset={asset}/>:<span>{asset.kind==='pdf'?'PDF':'YouTube'}</span>}
        <label>名称<input key={`${asset.id}-title-${asset.title}`} defaultValue={asset.title} maxLength={160} disabled={busy} onBlur={e=>{if(e.target.value!==asset.title)void act(()=>homeWrite('asset',{id:asset.id,title:e.target.value}))}}/></label>
        {asset.kind==='pdf'?<label>説明<textarea key={`${asset.id}-description-${asset.description}`} defaultValue={asset.description} maxLength={2000} disabled={busy} onBlur={e=>{if(e.target.value!==asset.description)void act(()=>homeWrite('asset',{id:asset.id,description:e.target.value}))}}/></label>:null}
        <label className="oh-check"><input disabled={busy} type="checkbox" checked={asset.published} onChange={e=>{const next=e.target.checked;setAssets(items=>items.map(item=>item.id===asset.id?{...item,published:next}:item));void act(async()=>{try{await homeWrite('asset',{id:asset.id,published:next})}catch(error){await load();throw error}})}}/>公開</label>
        <div className="oh-actions">{asset.kind!=='pdf'?<button disabled={busy||asset.is_main} onClick={()=>void act(()=>homeWrite('asset',{id:asset.id,is_main:true}))}>{asset.is_main?'メインに設定済み':'メインにする'}</button>:null}
          <button disabled={busy||index===0} onClick={()=>void move(asset.id,group[index-1].id)}>前へ</button><button disabled={busy||index===group.length-1} onClick={()=>void move(group[index+1].id,asset.id)}>後へ</button>
          {asset.kind!=='video'?<label>差し替え<input type="file" disabled={busy} accept={asset.kind==='pdf'?'application/pdf,.pdf':'image/jpeg,image/png,image/webp,image/heic,image/heif'} onChange={e=>{void upload(e.target.files,asset.kind as 'photo'|'pdf',asset);e.target.value=''}}/></label>:null}
          <button disabled={busy} onClick={()=>{if(window.confirm(`「${asset.title}」を削除しますか？`))void act(()=>homeWrite('delete',{id:asset.id}),'削除しました。')}}>削除</button></div>
      </article>})}</div>
    </>}
  </section>
}
