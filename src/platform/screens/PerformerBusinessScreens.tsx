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
import type { MerchOrder, TipRow } from '../lib/types'

export function PerformerScheduleScreen({ onBack, onLive }: { onBack: () => void; onLive: () => void }) {
  const { performer } = useAuth()
  const [rows, setRows] = useState<PerformerEventSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!performer) return
    listPerformerEventSlots(performer.id).then(setRows).catch(() => setError('出演予定を読み込めませんでした。時間をおいて再読み込みしてください。')).finally(() => setLoading(false))
  }, [performer])

  return <div className="pl-registration">
    <button className="pl-btn pl-btn--ghost" onClick={onBack}><ArrowLeft size={18} />戻る</button>
    <p className="pl-brand">APPEARANCES</p><h1 className="pl-h1">出演予定</h1>
    <p className="pl-muted">時間と場所をファンへ分かりやすく届けて、次に会える機会を見つけてもらいましょう。</p>
    {error ? <p className="pl-error">{error}</p> : null}
    {loading ? <p role="status">出演予定を確認しています…</p> : null}
    {!loading && !error && rows.length === 0 ? <section className="pl-registration__section"><CalendarDays size={28} /><h2 className="pl-h2">現在登録されている出演予定はありません</h2><p className="pl-muted">運営が出演予定を登録すると、ここに日時と会場が表示されます。</p></section> : null}
    {rows.map((slot) => <article className="pl-card pl-performer-slot" key={slot.id}>
      <p className="pl-brand">{new Date(`${slot.date}T00:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
      <h2 className="pl-h2">{slot.events?.name_ja ?? '大道芸博'}</h2>
      <strong>{slot.start_time}〜{slot.end_time}</strong>
      <p className="pl-muted">{slot.event_venues?.name_ja ?? '会場確認中'}{slot.stage_ja ? `・${slot.stage_ja}` : ''}</p>
      {slot.is_stream ? <span className="pl-registration__status"><Radio size={16} />LIVE予定</span> : null}
    </article>)}
    {rows.some((slot) => slot.is_stream) ? <button className="pl-btn pl-btn--block pl-btn--live" onClick={onLive}>LIVE配信を準備する</button> : null}
  </div>
}

function transactionRows(tips: TipRow[], orders: MerchOrder[]) {
  return [
    ...tips.map((row) => ({ id: `tip-${row.id}`, date: row.created_at, kind: '投げ銭', gross: row.gross_amount_yen ?? row.amount_cents, fee: row.platform_fee_yen ?? row.platform_fee_cents, status: row.status })),
    ...orders.map((row) => ({ id: `merch-${row.id}`, date: row.created_at, kind: 'グッズ', gross: row.gross_amount_yen ?? row.amount_yen, fee: row.platform_fee_yen, status: row.status })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

function transactionStatus(status: string) {
  return ({ succeeded: '支払い完了', pending: '処理中', failed: '失敗', expired: '期限切れ', refunded: '返金済み' } as Record<string, string>)[status] ?? status
}

export function PerformerEarningsScreen({ onBack }: { onBack: () => void }) {
  const { performer } = useAuth()
  const [tips, setTips] = useState<TipRow[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [fees, setFees] = useState({ tip: 1000, merch: 1000 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!performer) return
    Promise.all([listPerformerTipTransactions(performer.id), listSellerMerchOrders(performer.id), getTipFeeBps(), getMerchFeeBps()])
      .then(([tipRows, orderRows, tip, merch]) => { setTips(tipRows); setOrders(orderRows); setFees({ tip, merch }) })
      .catch(() => setError('売上を読み込めませんでした。時間をおいて再読み込みしてください。'))
      .finally(() => setLoading(false))
  }, [performer])
  const rows = useMemo(() => transactionRows(tips, orders), [tips, orders])
  const paid = rows.filter((row) => row.status === 'succeeded')
  const gross = paid.reduce((sum, row) => sum + row.gross, 0)
  const platformFee = paid.reduce((sum, row) => sum + row.fee, 0)
  return <div className="pl-registration">
    <button className="pl-btn pl-btn--ghost" onClick={onBack}><ArrowLeft size={18} />戻る</button>
    <p className="pl-brand">EARNINGS</p><h1 className="pl-h1">売上・入金について</h1>
    <p className="pl-muted">現地でもLIVEでも受け取った応援とグッズ売上を確認できます。</p>
    {loading ? <p role="status">売上を確認しています…</p> : null}
    {error ? <p className="pl-error">{error}</p> : null}
    <dl className="pl-registration__totals"><div><dt>支払い完了の売上</dt><dd>{formatYen(gross)}</dd></div><div><dt>大道芸博手数料</dt><dd>{formatYen(platformFee)}</dd></div><div><dt>Stripe費用控除前</dt><dd>{formatYen(Math.max(0, gross - platformFee))}</dd></div></dl>
    <section className="pl-registration__section"><h2 className="pl-h2">お金の流れ</h2><p className="pl-muted">ファンの支払いは、あなたのStripe Connectアカウントで直接決済されます。大道芸博の運営手数料は投げ銭 {(fees.tip / 100).toFixed(1)}%、グッズ {(fees.merch / 100).toFixed(1)}%です。Stripeの決済手数料、返金、チャージバックなどはConnected Account側で差し引かれるため、最終的な銀行入金額とは異なる場合があります。</p><p className="pl-muted">銀行口座番号などの情報は大道芸博では保存せず、Stripeで安全に管理されます。入金待ち・入金済み金額と入金日はStripeで確認してください。</p><a className="pl-btn pl-btn--ghost pl-btn--block" href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer"><ExternalLink size={18} />Stripeで入金を確認</a></section>
    <section className="pl-registration__section"><h2 className="pl-h2">1,000円の投げ銭例</h2><div className="pl-registration__money-flow"><span>ファンのお支払い<strong>{formatYen(1000)}</strong></span><span>大道芸博手数料（{(fees.tip / 100).toFixed(1)}%）<strong>−{formatYen(Math.floor(1000 * fees.tip / 10_000))}</strong></span><span>Stripe費用控除前<strong>{formatYen(1000 - Math.floor(1000 * fees.tip / 10_000))}</strong></span></div><p className="pl-muted">この金額は受取予定額ではありません。Stripeの決済手数料、返金等を反映した残高と銀行入金額はStripeで確認してください。</p></section>
    <section className="pl-registration__section"><h2 className="pl-h2">取引履歴</h2>{rows.length === 0 ? <p className="pl-muted">売上はまだありません。LIVEやプロフィールから応援を受け取ると、ここに表示されます。</p> : rows.map((row) => <div className="pl-registration__sale" key={row.id}><div><strong>{row.kind}・{formatYen(row.gross)}</strong><span>{new Date(row.date).toLocaleDateString('ja-JP')}・{transactionStatus(row.status)}</span></div><span>運営手数料 {formatYen(row.fee)}</span></div>)}</section>
  </div>
}
