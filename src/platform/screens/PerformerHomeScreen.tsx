import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Camera, Pencil, ShoppingBag, CalendarDays, Share2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { PayoutSetup, type ConnectStatus } from '../components/PayoutSetup'
import { listLiveHistory, listTipsForPerformer, tipSummaryForPerformer, updatePerformer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import { performerRegistrationStatus, registrationError } from '../lib/onboarding'
import { FESTIVAL_PATH, PLATFORM_PATH } from '../../app/routes'
import type { LiveSession, TipRow, TipSummary } from '../lib/types'

export function PerformerHomeScreen({ onEdit, onLive, onHistory, onMerch, onPreview }: {
  onEdit: () => void
  onLive: () => void
  onHistory: () => void
  onMerch: () => void
  onPreview: () => void
}) {
  const { performer, profile, refreshProfile, signOut } = useAuth()
  const [recent, setRecent] = useState<LiveSession[]>([])
  const [tips, setTips] = useState<TipRow[]>([])
  const [summary, setSummary] = useState<TipSummary>({ count: 0, amount_total: 0, fee_total: 0 })
  const [connect, setConnect] = useState<ConnectStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const performerId = performer?.id

  useEffect(() => {
    if (!performerId) return
    let active = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const [rows, tipRows, tipSum] = await Promise.all([
          listLiveHistory(performerId), listTipsForPerformer(performerId), tipSummaryForPerformer(performerId),
        ])
        if (!active) return
        setRecent(rows.slice(0, 3)); setTips(tipRows.slice(0, 5)); setSummary(tipSum)
      } catch { if (active) setError('売上情報を読み込めませんでした。時間をおいてページを開き直してください。') }
      finally { loading = false }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [performerId])

  useEffect(() => {
    const refresh = () => { void refreshProfile().catch(() => undefined) }
    const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshProfile])

  if (!performer || !profile) return <p className="pl-muted">登録情報を確認しています…</p>
  const status = performerRegistrationStatus({ ...performer, ...(connect ? { stripe_onboarding_complete: connect.complete, stripe_account_id: connect.connected ? 'connected' : null } : {}) })
  const steps = [
    { label: 'プロフィール', done: status.profileComplete, detail: status.profileComplete ? '登録済み' : status.missing.join('・') },
    { label: '売上の受取設定', done: status.payoutsComplete, detail: status.payoutsComplete ? '完了' : connect?.underReview ? 'Stripeで確認中' : '本人確認・振込口座' },
    { label: '運営確認・公開', done: status.approved, detail: status.approved ? '公開中' : status.profileComplete && status.payoutsComplete ? '運営の確認待ち' : '登録完了後に運営が確認' },
  ]
  const share = async () => {
    const url = `${window.location.origin}${PLATFORM_PATH}?profile=${encodeURIComponent(performer.id)}`
    try {
      if (navigator.share) await navigator.share({ title: performer.stage_name, url })
      else { await navigator.clipboard.writeText(url); setMessage('プロフィールのリンクをコピーしました。') }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('共有できませんでした。公開プロフィールを開いて、ブラウザから共有してください。')
    }
  }

  return <div className="pl-registration">
    <div className="pl-registration__identity">
      <Avatar url={performer.photo_url ?? profile.avatar_url} name={performer.stage_name} large />
      <div><h1 className="pl-h1">{performer.stage_name}</h1><p className="pl-muted">{status.approved ? '公開中' : '登録を進めましょう'}{performer.is_live ? '・LIVE中' : ''}</p></div>
    </div>

    <section className="pl-registration__section" aria-labelledby="registration-heading">
      <h2 id="registration-heading" className="pl-h2">{status.next === 'complete' ? '登録が完了しました' : '登録状況'}</h2>
      <ol className="pl-registration__steps">
        {steps.map((step) => <li key={step.label} data-done={step.done}>
          {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          <div><strong>{step.label}</strong><span>{step.detail}</span></div>
        </li>)}
      </ol>
      {status.next === 'profile' ? <button className="pl-btn pl-btn--block" onClick={onEdit}><Pencil size={18} />プロフィールを完成させる</button> : null}
      {status.next === 'payouts' ? <a className="pl-btn pl-btn--block" href="#payout-heading">受取設定へ進む</a> : null}
      {status.next === 'approval' ? <p className="pl-registration__notice">必要な登録が完了しました。追加の申請操作は不要です。運営の承認後に公開され、通知でもお知らせします。</p> : null}
      {status.approved ? <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={onPreview}>公開プロフィールを見る</button> : null}
    </section>

    <PayoutSetup performerId={performer.id} onStatus={setConnect} />

    <section className="pl-registration__section" aria-label="活動メニュー">
      <h2 className="pl-h2">活動メニュー</h2>
      <div className="pl-registration__actions">
        <button className="pl-btn pl-btn--ghost" onClick={onEdit}><Pencil size={18} />プロフィール・SNS</button>
        <button className="pl-btn pl-btn--ghost" disabled={!status.approved} onClick={onLive}><Camera size={18} />{performer.is_live ? 'LIVEを管理' : 'LIVE開始'}</button>
        <button className="pl-btn pl-btn--ghost" onClick={onMerch}><ShoppingBag size={18} />グッズ・注文管理</button>
        <a className="pl-btn pl-btn--ghost" href={FESTIVAL_PATH}><CalendarDays size={18} />イベント・出演情報</a>
        {status.approved ? <button className="pl-btn pl-btn--ghost" onClick={() => void share()}><Share2 size={18} />プロフィールを共有</button> : null}
      </div>
      {!status.approved ? <p className="pl-muted">公開・LIVE・販売開始は運営承認後に利用できます。グッズは先に下書きを作れます。</p> : null}
    </section>

    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {message ? <p className="pl-registration__notice" role="status">{message}</p> : null}
    <section className="pl-registration__section" aria-label="投げ銭の売上">
      <h2 className="pl-h2">投げ銭の売上</h2>
      <dl className="pl-registration__totals">
        <div><dt>応援件数</dt><dd>{summary.count}件</dd></div>
        <div><dt>売上合計</dt><dd>{formatYen(summary.amount_total)}</dd></div>
        <div><dt>運営手数料</dt><dd>{formatYen(summary.fee_total)}</dd></div>
      </dl>
      <p className="pl-muted">振込額・振込予定はStripeで確認できます。グッズの売上は「グッズ・注文管理」へ。</p>
      {tips.map((tip) => <div key={tip.id} className="pl-registration__sale"><strong>{formatYen(tip.amount_cents)}</strong><span>{new Date(tip.created_at).toLocaleDateString('ja-JP')}</span></div>)}
    </section>

    <details className="pl-registration__details"><summary>LIVE履歴・位置情報・アカウント</summary>
      {recent.map((session) => <p key={session.id} className="pl-muted">{new Date(session.started_at).toLocaleDateString('ja-JP')}・{session.ended_at ? '終了' : 'LIVE中'}・{formatYen(session.tip_amount_total)}</p>)}
      <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={onHistory}>LIVE履歴</button>
      <label className="pl-registration__toggle"><input type="checkbox" checked={performer.share_location} disabled={busy} onChange={(e) => {
        const checked = e.target.checked
        setBusy(true)
        void updatePerformer(performer.id, { share_location: checked }).then(refreshProfile).catch((e) => setError(registrationError(e))).finally(() => setBusy(false))
      }} />LIVE中の位置情報を公開</label>
      <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={() => void signOut()}>ログアウト</button>
    </details>
  </div>
}
