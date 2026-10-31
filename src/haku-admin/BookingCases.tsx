import { useEffect, useState } from 'react'
import { CASE_STATUSES, REQUEST_FIELDS, type BookingInput } from '../../shared/officialHome'
import { homeWrite } from '../platform/lib/officialHome'
import '../platform/components/official-home/official-home.css'
const HOLD_LABELS:Record<string,string>={statutory_review:'保存義務の確認待ち',statutory_record:'法定保存',dispute:'紛争対応'}
type Case={id:string;performer_id:string|null;anonymized_at:string|null;retention_due_at:string;hold_basis:string|null;hold_review_due_at:string|null;payload:BookingInput;status:keyof typeof CASE_STATUSES;created_at:string}
export function BookingCases(){
  const [cases,setCases]=useState<Case[]>([]);const [query,setQuery]=useState('');const [filter,setFilter]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const [privacyAllowed,setPrivacyAllowed]=useState(false);const [retention,setRetention]=useState<{due:number;held_overdue:number;processed:number}|null>(null)
  const reload=async(id?:string,status?:string)=>{setBusy(true);setError('');try{const result=await homeWrite('cases',{query,filter,id,status});setCases(result.cases as Case[]);setPrivacyAllowed(result.canManagePrivacy===true)}catch(e){setError(e instanceof Error?e.message:'取得に失敗しました。')}finally{setBusy(false)}}
  const privacy=async(id:string,operation:string,basis?:string)=>{
    if(!window.confirm(operation==='release_hold'?'法定保存対象の資料を承認済みの保管先へ移したか、保全が不要であることを確認しましたか？':'この案件の保全・個人情報消去操作を実行しますか？'))return
    setBusy(true);setError('');try{await homeWrite('case-privacy',{id,privacy_action:operation,basis,confirm:true});await reload()}catch(e){setError(e instanceof Error?e.message:'処理できませんでした。')}finally{setBusy(false)}
  }
  const maintain=async(execute=false)=>{
    if(execute&&!window.confirm('期限を過ぎた保全対象外の依頼の入力情報を消去します。続けますか？'))return
    setBusy(true);setError('');try{setRetention(await homeWrite('retention',{execute}) as unknown as {due:number;held_overdue:number;processed:number});if(execute)await reload()}catch(e){setError(e instanceof Error?e.message:'処理できませんでした。')}finally{setBusy(false)}
  }
  useEffect(()=>{void reload()},[])
  return <section className="oh-cases"><h2>出演依頼・事務局案件</h2><p>ここで確認してから出演者へ連絡してください。出演者への自動転送はありません。新規依頼は既存のHAKU内通知にも届きます。</p><form onSubmit={e=>{e.preventDefault();void reload()}}><label>案件検索<input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></label><label>ステータス<select aria-label="ステータス" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">すべて</option>{Object.entries(CASE_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button disabled={busy}>検索・更新</button></form>
    <p>通常の問い合わせは受付から180日、見送りは終了後90日以内を目安に消去します。見積もり・成約案件は法定保存対象の確認が完了するまで保全します。</p><button disabled={busy} onClick={()=>void maintain()}>保存期限を確認</button>{retention?<p role="status">期限超過 {retention.due}件・保全の再確認待ち {retention.held_overdue}件・今回消去 {retention.processed}件</p>:null}{privacyAllowed?<><button disabled={busy} onClick={()=>void maintain(true)}>期限超過の入力情報を消去</button><button disabled={busy} onClick={async()=>{if(!window.confirm('削除待ちの公式ページ用ファイルだけをStorageから削除しますか？'))return;setBusy(true);try{const r=await homeWrite('cleanup',{confirm:true});setError(`ファイル削除 完了${r.processed}件・再試行待ち${r.failed}件`)}catch(e){setError(e instanceof Error?e.message:'処理できませんでした。')}finally{setBusy(false)}}}>削除待ちファイルを処理</button></>:null}
    {error?<p role="alert">{error}</p>:null}{busy?<p role="status">読み込み中…</p>:null}{!busy&&!cases.length?<p>該当する案件はありません。</p>:null}
    {cases.map(row=><details key={row.id}><summary>{CASE_STATUSES[row.status]} · {row.anonymized_at?'入力情報消去済み':row.payload.organization} · {row.payload.date||''}</summary><p>受付 {new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} / {row.id}</p>{row.performer_id?<a href={`/performer/${row.performer_id}`} target="_blank" rel="noopener noreferrer">希望パフォーマーを確認</a>:<p>出演者の関連付けなし</p>}<p>消去予定：{new Date(row.retention_due_at).toLocaleDateString('ja-JP')} {row.hold_basis?`／保全中（${HOLD_LABELS[row.hold_basis]||'確認待ち'}）`:null}</p><dl>{Object.entries(REQUEST_FIELDS).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{row.payload[key as keyof BookingInput]||'—'}</dd></div>)}</dl><label>ステータス変更<select aria-label="ステータス変更" disabled={busy||Boolean(row.anonymized_at)} value={row.status} onChange={e=>void reload(row.id,e.target.value)}>{Object.entries(CASE_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{privacyAllowed&&!row.anonymized_at?<div>{row.hold_basis?<button disabled={busy} onClick={()=>void privacy(row.id,'release_hold')}>保全を解除</button>:<><button disabled={busy} onClick={()=>void privacy(row.id,'hold','statutory_record')}>法定保存のため保全</button><button disabled={busy} onClick={()=>void privacy(row.id,'hold','dispute')}>紛争対応のため保全</button><button disabled={busy} onClick={()=>void privacy(row.id,'erase')}>入力情報を消去</button></>}</div>:null}</details>)}
  </section>
}
