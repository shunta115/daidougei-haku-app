import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/LangProvider'
import { AppBackButton } from '../components/AppBackButton'
import { listPerformerOffers, updatePerformanceOfferStatus } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { PerformanceOffer, PerformanceOfferStatus } from '../lib/types'

export function PerformerOffersScreen({ onBack }: { onBack: () => void }) {
  const { performer } = useAuth(); const { lang } = useLang(); const [rows, setRows] = useState<PerformanceOffer[]>([]); const [error, setError] = useState<string | null>(null)
  const t = lang === 'en' ? { title: 'Appearance offers', empty: 'No offers.', accept: 'Accept', decline: 'Decline', reviewing: 'Reviewing', failed: 'Could not update.' } : lang === 'zh-TW' ? { title: '演出邀請', empty: '尚無邀請。', accept: '接受', decline: '婉拒', reviewing: '確認中', failed: '無法更新。' } : { title: '出演依頼', empty: '出演依頼はありません。', accept: '承諾', decline: '辞退', reviewing: '確認中', failed: '更新できませんでした。' }
  const reload = async () => { if (performer) setRows(await listPerformerOffers(performer.id)) }
  useEffect(() => { void reload().catch(() => setError(t.failed)) }, [performer?.id, t.failed])
  const respond = async (id: string, status: PerformanceOfferStatus) => { try { await updatePerformanceOfferStatus(id, status); await reload(); setError(null) } catch { setError(t.failed) } }
  return <main className="pl-registration"><AppBackButton onClick={onBack} label="Back" /><p className="pl-brand">OFFERS</p><h1 className="pl-h1">{t.title}</h1>{error ? <p className="pl-error">{error}</p> : null}{rows.length === 0 ? <p className="pl-muted">{t.empty}</p> : rows.map((item) => <article className="pl-registration__section" key={item.id}><span className="pl-registration__status">{item.status}</span><h2 className="pl-h2">{item.event_name}</h2><p>{item.requester_name} · {item.desired_date} · {item.location}</p><p>{item.performance_details}</p><strong>{item.compensation_terms}</strong>{item.status === 'sent' || item.status === 'reviewing' ? <div className="pl-appearance-actions"><button className="pl-btn pl-btn--ghost" onClick={() => void respond(item.id, 'reviewing')}>{t.reviewing}</button><button className="pl-btn" onClick={() => void respond(item.id, 'accepted')}>{t.accept}</button><button className="pl-btn pl-btn--danger" onClick={() => void respond(item.id, 'declined')}>{t.decline}</button></div> : null}</article>)}</main>
}
