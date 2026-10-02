import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ExternalLink, Radio } from 'lucide-react'
import { formatYen } from '../lib/money'
import {
  getMerchFeeBps,
  getTipFeeBps,
  listPerformerEventSlots,
  listPerformerTipTransactions,
  listSellerMerchOrders,
  type PerformerEventSlot,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import type { MerchOrder, TipRow } from '../lib/types'
import { SystemFeeExplain } from '../components/SystemFeeExplain'

export function PerformerScheduleScreen({ onBack, onLive }: { onBack: () => void; onLive: () => void }) {
  const { t, lang } = useLang()
  const { performer } = useAuth()
  const [rows, setRows] = useState<PerformerEventSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!performer) return
    listPerformerEventSlots(performer.id).then(setRows).catch(() => setError(t('scheduleLoadError'))).finally(() => setLoading(false))
  }, [performer, t])

  return <div className="pl-registration">
    <button className="pl-btn pl-btn--ghost" onClick={onBack}><ArrowLeft size={18} />{t('back')}</button>
    <p className="pl-brand">APPEARANCES</p><h1 className="pl-h1">{t('scheduleTitle')}</h1>
    <p className="pl-muted">{t('scheduleLead')}</p>
    {error ? <p className="pl-error">{error}</p> : null}
    {loading ? <p role="status">{t('scheduleLoading')}</p> : null}
    {!loading && !error && rows.length === 0 ? <section className="pl-registration__section"><CalendarDays size={28} /><h2 className="pl-h2">{t('scheduleEmptyTitle')}</h2><p className="pl-muted">{t('scheduleEmptyBody')}</p></section> : null}
    {rows.map((slot) => <article className="pl-card pl-performer-slot" key={slot.id}>
      <p className="pl-brand">{new Date(`${slot.date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
      <h2 className="pl-h2">{slot.events?.name_ja ?? t('appName')}</h2>
      <strong>{slot.start_time}〜{slot.end_time}</strong>
      <p className="pl-muted">{slot.event_venues?.name_ja ?? t('scheduleVenuePending')}{slot.stage_ja ? `・${slot.stage_ja}` : ''}</p>
      {slot.is_stream ? <span className="pl-registration__status"><Radio size={16} />{t('liveScheduled')}</span> : null}
    </article>)}
    {rows.some((slot) => slot.is_stream) ? <button className="pl-btn pl-btn--block pl-btn--live" onClick={onLive}>{t('schedulePrepareLive')}</button> : null}
  </div>
}

function transactionRows(tips: TipRow[], orders: MerchOrder[]) {
  return [
    ...tips.map((row) => ({ id: `tip-${row.id}`, date: row.created_at, kind: 'tip' as const, gross: row.gross_amount_yen ?? row.amount_cents, fee: row.platform_fee_yen ?? row.platform_fee_cents, status: row.status })),
    ...orders.map((row) => ({ id: `merch-${row.id}`, date: row.created_at, kind: 'merch' as const, gross: row.gross_amount_yen ?? row.amount_yen, fee: row.platform_fee_yen, status: row.status })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

function transactionStatus(status: string, label: (key: 'statusPaid' | 'statusPending' | 'statusFailed' | 'statusExpired' | 'statusRefunded') => string) {
  const key = ({ succeeded: 'statusPaid', pending: 'statusPending', failed: 'statusFailed', expired: 'statusExpired', refunded: 'statusRefunded' } as const)[status]
  return key ? label(key) : status
}

export function PerformerEarningsScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useLang()
  const { performer } = useAuth()
  const [tips, setTips] = useState<TipRow[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [fees, setFees] = useState({ tip: 1500, merch: 800 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!performer) return
    Promise.all([listPerformerTipTransactions(performer.id), listSellerMerchOrders(performer.id), getTipFeeBps(), getMerchFeeBps()])
      .then(([tipRows, orderRows, tip, merch]) => { setTips(tipRows); setOrders(orderRows); setFees({ tip, merch }) })
      .catch(() => setError(t('earnLoadError')))
      .finally(() => setLoading(false))
  }, [performer, t])
  const rows = useMemo(() => transactionRows(tips, orders), [tips, orders])
  const paid = rows.filter((row) => row.status === 'succeeded')
  const gross = paid.reduce((sum, row) => sum + row.gross, 0)
  const platformFee = paid.reduce((sum, row) => sum + row.fee, 0)
  const tipPercent = (fees.tip / 100).toFixed(1)
  const merchPercent = (fees.merch / 100).toFixed(1)
  const locale = lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ja-JP'
  return <div className="pl-registration">
    <button className="pl-btn pl-btn--ghost" onClick={onBack}><ArrowLeft size={18} />{t('back')}</button>
    <p className="pl-brand">EARNINGS</p><h1 className="pl-h1">{t('earnTitle')}</h1>
    <p className="pl-muted">{t('earnLead')}</p>
    {loading ? <p role="status">{t('earnLoading')}</p> : null}
    {error ? <p className="pl-error">{error}</p> : null}
    <dl className="pl-registration__totals"><div><dt>{t('salesPaid')}</dt><dd>{formatYen(gross)}</dd></div><div><dt>{t('salesFee')}</dt><dd>{formatYen(platformFee)}</dd></div><div><dt>{t('salesBeforeStripe')}</dt><dd>{formatYen(Math.max(0, gross - platformFee))}</dd></div></dl>
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesFlowTitle')}</h2><p className="pl-muted">{t('salesFlow', { tip: tipPercent, merch: merchPercent })}</p><p className="pl-muted">{t('salesBankNote')}</p><a className="pl-btn pl-btn--ghost pl-btn--block" href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer"><ExternalLink size={18} />{t('salesOpenStripe')}</a></section>
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesExample')}</h2><div className="pl-registration__money-flow"><span>{t('salesFanPays')}<strong>{formatYen(1000)}</strong></span><span>{t('salesFeeLine', { tip: tipPercent })}<strong>−{formatYen(Math.floor(1000 * fees.tip / 10_000))}</strong></span><span>{t('salesBeforeStripe')}<strong>{formatYen(1000 - Math.floor(1000 * fees.tip / 10_000))}</strong></span></div><p className="pl-muted">{t('salesNotFinal')}</p></section>
    <SystemFeeExplain />
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesHistory')}</h2>{rows.length === 0 ? <p className="pl-muted">{t('salesEmpty')}</p> : rows.map((row) => <div className="pl-registration__sale" key={row.id}><div><strong>{row.kind === 'tip' ? t('kindTip') : t('kindMerch')}・{formatYen(row.gross)}</strong><span>{new Date(row.date).toLocaleDateString(locale)}・{transactionStatus(row.status, t)}</span></div><span>{t('salesFeeItem', { amount: formatYen(row.fee) })}</span></div>)}</section>
  </div>
}
