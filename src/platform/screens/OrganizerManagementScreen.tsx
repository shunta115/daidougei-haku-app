import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/LangProvider'
import { createPerformanceOffer, getOrganizerProfile, listOrganizerOffers, saveOrganizerProfile, searchPerformers, type PerformanceOfferInput } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { OrganizerProfile, PerformanceOffer, Performer } from '../lib/types'
import { Avatar } from '../components/Avatar'

type Props = { onOpenPerformer: (id: string) => void }
const blankOffer = (): PerformanceOfferInput => ({ requester_name: '', event_name: '', desired_date: '', location: '', performance_details: '', requested_duration: '', compensation_terms: '', notes: '', response_deadline: null })
const blankProfile = (): Pick<OrganizerProfile, 'organization_name' | 'description' | 'website_url' | 'country' | 'region'> => ({ organization_name: '', description: '', website_url: null, country: '', region: '' })

export function OrganizerManagementScreen({ onOpenPerformer }: Props) {
  const { user, signOut } = useAuth()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const [performers, setPerformers] = useState<Performer[]>([])
  const [target, setTarget] = useState<Performer | null>(null)
  const [profile, setProfile] = useState(blankProfile)
  const [offer, setOffer] = useState<PerformanceOfferInput>(blankOffer)
  const [offers, setOffers] = useState<PerformanceOffer[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = lang === 'en'
    ? { title: 'Organizer desk', profile: 'Organizer profile', org: 'Organization', about: 'About', website: 'Website (HTTPS)', country: 'Country', region: 'Region', save: 'Save', find: 'Find performers', view: 'View', request: 'Offer', event: 'Event name', date: 'Preferred date', location: 'Location', details: 'Performance details', duration: 'Duration', compensation: 'Compensation terms', deadline: 'Response deadline', notes: 'Notes', draft: 'Save draft', send: 'Send offer', history: 'Offer history', required: 'Complete the organization, event, date, location, and compensation fields.', failed: 'Could not save.' }
    : lang === 'zh-TW'
      ? { title: '主辦方管理台', profile: '主辦方資料', org: '主辦單位', about: '介紹', website: '網站（HTTPS）', country: '國家', region: '地區', save: '儲存', find: '搜尋表演者', view: '查看', request: '邀請', event: '活動名稱', date: '希望日期', location: '地點', details: '演出內容', duration: '演出時間', compensation: '報酬條件', deadline: '回覆期限', notes: '聯絡事項', draft: '儲存草稿', send: '傳送邀請', history: '邀請紀錄', required: '請填寫主辦單位、活動、日期、地點及報酬。', failed: '無法儲存。' }
      : { title: '主催者デスク', profile: '主催者プロフィール', org: '主催者・企業名', about: '主催者情報', website: 'Webサイト（HTTPS）', country: '国', region: '地域', save: '保存', find: 'パフォーマー検索', view: '見る', request: '依頼', event: 'イベント名', date: '開催希望日', location: '開催場所', details: '出演内容', duration: '希望出演時間', compensation: '報酬条件', deadline: '回答期限', notes: '連絡事項', draft: '下書き保存', send: '出演依頼を送信', history: '依頼履歴', required: '主催者名・イベント名・日付・場所・報酬条件を入力してください。', failed: '保存できませんでした。' }

  const reload = async () => { if (user) setOffers(await listOrganizerOffers(user.id)) }
  useEffect(() => { if (!user) return; getOrganizerProfile(user.id).then((row) => row && setProfile(row)).catch(() => undefined); void reload().catch(() => undefined) }, [user?.id])
  const saveProfile = async () => { if (!user || !profile.organization_name.trim()) return setError(t.required); try { await saveOrganizerProfile(user.id, profile); setFeedback(t.save); setError(null) } catch { setError(t.failed) } }
  const submit = async (send: boolean) => {
    if (!user || !target || !profile.organization_name.trim() || !offer.event_name.trim() || !offer.desired_date || !offer.location.trim() || !offer.compensation_terms.trim()) return setError(t.required)
    try { await createPerformanceOffer(user.id, target.id, { ...offer, requester_name: profile.organization_name }, send); setTarget(null); setOffer(blankOffer()); await reload(); setFeedback(t.save); setError(null) } catch { setError(t.failed) }
  }
  return <main className="pl-registration"><p className="pl-brand">ORGANIZER</p><h1 className="pl-h1">{t.title}</h1>
    <section className="pl-registration__section"><h2 className="pl-h2">{t.profile}</h2><label>{t.org}<input className="pl-input" value={profile.organization_name} onChange={(e) => setProfile((v) => ({ ...v, organization_name: e.target.value }))} /></label><label>{t.about}<textarea className="pl-input" value={profile.description} onChange={(e) => setProfile((v) => ({ ...v, description: e.target.value }))} /></label><label>{t.website}<input className="pl-input" type="url" value={profile.website_url ?? ''} onChange={(e) => setProfile((v) => ({ ...v, website_url: e.target.value || null }))} /></label><div className="pl-appearance-form__grid"><label>{t.country}<input className="pl-input" value={profile.country} onChange={(e) => setProfile((v) => ({ ...v, country: e.target.value }))} /></label><label>{t.region}<input className="pl-input" value={profile.region} onChange={(e) => setProfile((v) => ({ ...v, region: e.target.value }))} /></label></div><button className="pl-btn pl-btn--block" onClick={() => void saveProfile()}>{t.save}</button></section>
    <section className="pl-registration__section"><h2 className="pl-h2">{t.find}</h2><input className="pl-input" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="pl-btn pl-btn--block" onClick={() => void searchPerformers(query).then(setPerformers).catch(() => setError(t.failed))}>{t.find}</button>{performers.map((p) => <div className="pl-card pl-row" key={p.id}><Avatar url={p.photo_url} name={p.stage_name} /><div style={{ flex: 1 }}><strong>{p.stage_name}</strong><p className="pl-muted">{p.genre} · {p.city}</p></div><button className="pl-btn pl-btn--ghost" onClick={() => onOpenPerformer(p.id)}>{t.view}</button><button className="pl-btn" onClick={() => setTarget(p)}>{t.request}</button></div>)}</section>
    {target ? <section className="pl-registration__section"><h2 className="pl-h2">{target.stage_name} — {t.request}</h2><label>{t.event}<input className="pl-input" value={offer.event_name} onChange={(e) => setOffer((v) => ({ ...v, event_name: e.target.value }))} /></label><label>{t.date}<input className="pl-input" type="date" value={offer.desired_date} onChange={(e) => setOffer((v) => ({ ...v, desired_date: e.target.value }))} /></label><label>{t.location}<input className="pl-input" value={offer.location} onChange={(e) => setOffer((v) => ({ ...v, location: e.target.value }))} /></label><label>{t.details}<textarea className="pl-input" value={offer.performance_details} onChange={(e) => setOffer((v) => ({ ...v, performance_details: e.target.value }))} /></label><label>{t.duration}<input className="pl-input" value={offer.requested_duration} onChange={(e) => setOffer((v) => ({ ...v, requested_duration: e.target.value }))} /></label><label>{t.compensation}<textarea className="pl-input" value={offer.compensation_terms} onChange={(e) => setOffer((v) => ({ ...v, compensation_terms: e.target.value }))} /></label><label>{t.deadline}<input className="pl-input" type="datetime-local" onChange={(e) => setOffer((v) => ({ ...v, response_deadline: e.target.value ? new Date(e.target.value).toISOString() : null }))} /></label><label>{t.notes}<textarea className="pl-input" value={offer.notes} onChange={(e) => setOffer((v) => ({ ...v, notes: e.target.value }))} /></label><div className="pl-appearance-actions"><button className="pl-btn pl-btn--ghost" onClick={() => void submit(false)}>{t.draft}</button><button className="pl-btn" onClick={() => void submit(true)}>{t.send}</button></div></section> : null}
    <section className="pl-registration__section"><h2 className="pl-h2">{t.history}</h2>{offers.map((item) => <article className="pl-card" key={item.id}><span className="pl-registration__status">{item.status}</span><strong>{item.event_name}</strong><p>{item.desired_date} · {item.location}</p></article>)}</section>{feedback ? <p className="pl-registration__notice">{feedback}</p> : null}{error ? <p className="pl-error">{error}</p> : null}<button className="pl-btn pl-btn--ghost pl-btn--block" onClick={() => void signOut()}>Logout</button>
  </main>
}
