import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Radio } from 'lucide-react'
import { formatYen } from '../lib/money'
import {
  fetchPerformerPayoutView,
  listPerformerEventSlots,
  listPerformerTipTransactions,
  listSellerMerchOrders,
  requestPerformerPayout,
  type PerformerEventSlot,
  type PerformerPayoutView,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import type { MerchOrder, TipRow } from '../lib/types'
import { SystemFeeExplain } from '../components/SystemFeeExplain'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS, bpsToPercentLabel, settleSaleAfterRefund } from '../../../shared/fees'
import { displayStageName } from '../lib/stageLabel'

export function PerformerScheduleScreen({ onBack, onLive }: { onBack: () => void; onLive: () => void }) {
  const { t, lang } = useLang()
  const { performer } = useAuth()
  const [rows, setRows] = useState<PerformerEventSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!performer) return
    listPerformerEventSlots(performer.id).then(setRows).catch(() => setError(t('scheduleLoadError'))).finally(() => setLoading(false))
  }, [performer?.id])

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
      <p className="pl-muted">{displayStageName(slot.event_venues?.name_ja) || t('scheduleVenuePending')}{slot.stage_ja ? `・${displayStageName(slot.stage_ja)}` : ''}</p>
      {slot.is_stream ? <span className="pl-registration__status"><Radio size={16} />{t('liveScheduled')}</span> : null}
    </article>)}
    {rows.some((slot) => slot.is_stream) ? <button className="pl-btn pl-btn--block pl-btn--live" onClick={onLive}>{t('schedulePrepareLive')}</button> : null}
  </div>
}

function transactionRows(tips: TipRow[], orders: MerchOrder[]) {
  return [
    ...tips.map((row) => {
      const gross = row.gross_amount_yen ?? row.amount_cents
      const current = settleSaleAfterRefund(gross, row.stripe_fee_yen ?? 0, row.refunded_amount_yen ?? 0, TIP_SYSTEM_FEE_BPS)
      return { id: `tip-${row.id}`, date: row.created_at, kind: 'tip' as const, gross, fee: row.settlement_status === 'settled' ? current.hakuFeeYen : row.haku_fee_yen, stripeFee: row.stripe_fee_yen, settled: row.settlement_status === 'settled', refunded: row.refunded_amount_yen ?? 0, status: row.status }
    }),
    ...orders.map((row) => {
      const gross = row.gross_amount_yen ?? row.amount_yen
      const current = settleSaleAfterRefund(gross, row.stripe_fee_yen ?? 0, row.refunded_amount_yen ?? 0, MERCH_SYSTEM_FEE_BPS)
      return { id: `merch-${row.id}`, date: row.created_at, kind: 'merch' as const, gross, fee: row.settlement_status === 'settled' ? current.hakuFeeYen : row.haku_fee_yen, stripeFee: row.stripe_fee_yen, settled: row.settlement_status === 'settled', refunded: row.refunded_amount_yen ?? 0, status: row.status }
    }),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

function transactionStatus(
  status: string,
  refundedYen: number,
  label: (key: 'statusPaid' | 'statusPending' | 'statusFailed' | 'statusExpired' | 'statusRefunded' | 'statusPartialRefund') => string,
) {
  if (status === 'succeeded' && refundedYen > 0) return label('statusPartialRefund')
  const key = ({ succeeded: 'statusPaid', pending: 'statusPending', failed: 'statusFailed', expired: 'statusExpired', refunded: 'statusRefunded' } as const)[status]
  return key ? label(key) : status
}

export function PerformerEarningsScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useLang()
  const { performer } = useAuth()
  const [tips, setTips] = useState<TipRow[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [payout, setPayout] = useState<PerformerPayoutView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!performer) return
    Promise.all([
      listPerformerTipTransactions(performer.id),
      listSellerMerchOrders(performer.id),
      fetchPerformerPayoutView(performer.id).catch(() => null),
    ])
      .then(([tipRows, orderRows, view]) => {
        setTips(tipRows)
        setOrders(orderRows)
        setPayout(view)
      })
      .catch(() => setError(t('earnLoadError')))
      .finally(() => setLoading(false))
  }, [performer?.id])
  const rows = useMemo(() => transactionRows(tips, orders), [tips, orders])
  const paid = rows.filter((row) => row.status === 'succeeded' || row.status === 'refunded')
  const gross = paid.reduce((sum, row) => sum + row.gross, 0)
  const tipPercent = bpsToPercentLabel(TIP_SYSTEM_FEE_BPS)
  const merchPercent = bpsToPercentLabel(MERCH_SYSTEM_FEE_BPS)
  const locale = lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ja-JP'
  const available = payout?.availableYen ?? 0
  const canPayout = Boolean(payout?.canPayout)
  const requestPayout = async () => {
    if (!performer || busy || !canPayout) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await requestPerformerPayout(performer.id)
      setPayout(await fetchPerformerPayoutView(performer.id))
      setMessage(t('payoutOk'))
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('payoutFail'))
    } finally {
      setBusy(false)
    }
  }
  return <div className="pl-registration">
    <button className="pl-btn pl-btn--ghost" onClick={onBack}><ArrowLeft size={18} />{t('back')}</button>
    <p className="pl-brand">EARNINGS</p><h1 className="pl-h1">{t('earnTitle')}</h1>
    <p className="pl-muted">{t('earnLead')}</p>
    {loading ? <p role="status">{t('earnLoading')}</p> : null}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {message ? <p className="pl-registration__notice" role="status">{message}</p> : null}
    <dl className="pl-registration__totals">
      <div><dt>{t('salesPaid')}</dt><dd>{formatYen(payout?.confirmedSalesYen ?? gross)}</dd></div>
      <div><dt>{t('payoutAvailable')}</dt><dd>{formatYen(available)}</dd></div>
      <div><dt>{t('payoutPending')}</dt><dd>{formatYen(payout?.pendingYen ?? 0)}</dd></div>
      <div><dt>保留中</dt><dd>{formatYen(payout?.heldYen ?? 0)}</dd></div>
      <div><dt>{t('payoutPaidOut')}</dt><dd>{formatYen(payout?.paidOutYen ?? 0)}</dd></div>
    </dl>
    <section className="pl-registration__section">
      <h2 className="pl-h2">{t('payoutMinLabel')}</h2>
      <p className="pl-muted">{canPayout ? t('payoutReady') : t('payoutNeedMoreYen', { amount: formatYen(payout?.remainingYen ?? 10000) })}</p>
      <p className="pl-muted">{t('payoutHakuBalance')} {formatYen(payout?.hakuAvailableYen ?? 0)}</p>
      {confirming ? (
        <div className="pl-registration__notice">
          <p>{t('payoutConfirmTitle')}</p>
          <p>{t('payoutConfirmBody', { amount: formatYen(available) })}</p>
          <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void requestPayout()}>{busy ? t('payoutWorking') : t('payoutConfirm')}</button>
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => setConfirming(false)}>{t('payoutCancel')}</button>
        </div>
      ) : (
        <button type="button" className="pl-btn pl-btn--block" disabled={!canPayout || busy} onClick={() => setConfirming(true)}>{t('payoutRequest')}</button>
      )}
    </section>
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesFlowTitle')}</h2><p className="pl-muted">{t('salesFlow', { tip: tipPercent, merch: merchPercent })}</p><p className="pl-muted">{t('salesBankNote')}</p></section>
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesExample')}</h2><div className="pl-registration__money-flow"><span>{t('salesFanPays')}<strong>{formatYen(1000)}</strong></span><span>{t('feeStripeAfter')}<strong>—</strong></span><span>{t('salesFeeLine', { tip: tipPercent })}<strong>{t('salesNotFinal')}</strong></span></div></section>
    <SystemFeeExplain />
    <section className="pl-registration__section"><h2 className="pl-h2">{t('salesHistory')}</h2>{rows.length === 0 ? <p className="pl-muted">{t('salesEmpty')}</p> : rows.map((row) => <div className="pl-registration__sale" key={row.id}><div><strong>{row.kind === 'tip' ? t('kindTip') : t('kindMerch')}・{formatYen(row.gross)}</strong><span>{new Date(row.date).toLocaleDateString(locale)}・{transactionStatus(row.status, row.refunded, t)}</span>{row.settled ? <span>{t('feeStripeAfter')} {formatYen(row.stripeFee ?? 0)}</span> : <span>{t('salesNotFinal')}</span>}</div><span>{row.settled && row.fee != null ? t('salesFeeItem', { amount: formatYen(row.fee) }) : 'HAKUシステム利用料 未算定'}</span></div>)}</section>
  </div>
}
