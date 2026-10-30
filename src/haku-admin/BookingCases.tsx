import { useEffect, useState } from 'react'
import { CASE_STATUSES, REQUEST_FIELDS, type BookingInput } from '../../shared/officialHome'
import { homeWrite } from '../platform/lib/officialHome'
import '../platform/components/official-home/official-home.css'
type Case={id:string;performer_id:string;payload:BookingInput;status:keyof typeof CASE_STATUSES;created_at:string}
export function BookingCases(){
  const [cases,setCases]=useState<Case[]>([]);const [query,setQuery]=useState('');const [filter,setFilter]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const reload=async(id?:string,status?:string)=>{setBusy(true);setError('');try{const result=await homeWrite('cases',{query,filter,id,status});setCases(result.cases as Case[])}catch(e){setError(e instanceof Error?e.message:'取得に失敗しました。')}finally{setBusy(false)}}
  useEffect(()=>{void reload()},[])
  return <section className="oh-cases"><h2>出演依頼・事務局案件</h2><p>ここで確認してから出演者へ連絡してください。出演者への自動転送はありません。新規依頼は既存のHAKU内通知にも届きます。</p><form onSubmit={e=>{e.preventDefault();void reload()}}><label>案件検索<input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></label><label>ステータス<select aria-label="ステータス" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">すべて</option>{Object.entries(CASE_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button disabled={busy}>検索・更新</button></form>
    {error?<p role="alert">{error}</p>:null}{busy?<p role="status">読み込み中…</p>:null}{!busy&&!cases.length?<p>該当する案件はありません。</p>:null}
    {cases.map(row=><details key={row.id}><summary>{CASE_STATUSES[row.status]} · {row.payload.organization} · {row.payload.date}</summary><p>受付 {new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} / {row.id}</p><a href={`/performer/${row.performer_id}`} target="_blank" rel="noopener noreferrer">希望パフォーマーを確認</a><dl>{Object.entries(REQUEST_FIELDS).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{row.payload[key as keyof BookingInput]||'—'}</dd></div>)}</dl><label>ステータス変更<select aria-label="ステータス変更" disabled={busy} value={row.status} onChange={e=>void reload(row.id,e.target.value)}>{Object.entries(CASE_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></details>)}
  </section>
}
