import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Camera, Pencil, ShoppingBag, CalendarDays, Share2, WalletCards } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { PayoutSetup, type ConnectStatus } from '../components/PayoutSetup'
import { listLiveHistory, listTipsForPerformer, tipSummaryForPerformer, updatePerformer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import { performerRegistrationStatus, registrationError } from '../lib/onboarding'
import { useLang } from '../../i18n/LangProvider'
import { PLATFORM_PATH } from '../../app/routes'
import type { LiveSession, TipRow, TipSummary } from '../lib/types'

export function PerformerHomeScreen({ onEdit, onLive, onHistory, onMerch, onPreview, onSchedule, onEarnings, onNotifications, onOpenTitle }: {
  onEdit: () => void
  onLive: () => void
  onHistory: () => void
  onMerch: () => void
  onPreview: () => void
  onSchedule: () => void
  onEarnings: () => void
  onNotifications?: () => void
  onOpenTitle?: () => void
}) {
  const { t, lang } = useLang()
  const { performer, profile, refreshProfile, signOut, updatePassword } = useAuth()
  const [recent, setRecent] = useState<LiveSession[]>([])
  const [tips, setTips] = useState<TipRow[]>([])
  const [summary, setSummary] = useState<TipSummary>({ count: 0, amount_total: 0, fee_total: 0 })
  const [connect, setConnect] = useState<ConnectStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null)
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
      } catch { if (active) setError(t('salesLoadError')) }
      finally { loading = false }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [performerId, t])

  useEffect(() => {
    const refresh = () => { void refreshProfile().catch(() => undefined) }
    const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshProfile])

  if (!performer || !profile) return <p className="pl-muted">{t('regChecking')}</p>
  const status = performerRegistrationStatus({ ...performer, ...(connect ? { stripe_onboarding_complete: connect.complete, stripe_account_id: connect.connected ? 'connected' : null } : {}) })
  const missing = status.missing.map((item) => item === '芸名' ? t('editStage') : item === 'ジャンル' ? t('editGenre') : item === '自己紹介' ? t('editBio') : item === '活動地域' ? t('editArea') : item === 'プロフィール写真' ? t('editPhoto') : item)
  const steps = [
    { label: t('stepProfile'), done: status.profileComplete, detail: status.profileComplete ? t('stepRegistered') : missing.join('・') },
    { label: t('stepPayout'), done: status.payoutsComplete, detail: status.payoutsComplete ? t('stepDone') : connect?.underReview ? t('stepStripeReview') : t('stepIdentity') },
    { label: t('stepPublish'), done: status.approved, detail: status.approved ? t('stepLive') : status.profileComplete && status.payoutsComplete ? t('stepWaiting') : t('stepAfterRegister') },
  ]
  const share = async () => {
    const url = `${window.location.origin}${PLATFORM_PATH}?profile=${encodeURIComponent(performer.id)}`
    try {
      if (navigator.share) await navigator.share({ title: performer.stage_name, url })
      else { await navigator.clipboard.writeText(url); setMessage(t('copiedLink')) }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(t('shareFail'))
    }
  }

  return <div className="pl-registration">
    <div className="pl-registration__identity">
      <Avatar url={performer.photo_url ?? profile.avatar_url} name={performer.stage_name} large />
      <div><h1 className="pl-h1">{performer.stage_name}</h1><p className="pl-muted">{status.approved ? t('stepLive') : t('continueReg')}{performer.is_live ? `・${t('liveNow')}` : ''}</p></div>
    </div>

    <section className="pl-registration__section" aria-labelledby="registration-heading">
      <h2 id="registration-heading" className="pl-h2">{status.next === 'complete' ? t('regComplete') : t('regStatus')}</h2>
      <ol className="pl-registration__steps">
        {steps.map((step) => <li key={step.label} data-done={step.done}>
          {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          <div><strong>{step.label}</strong><span>{step.detail}</span></div>
        </li>)}
      </ol>
      {status.next === 'profile' ? <button className="pl-btn pl-btn--block" onClick={onEdit}><Pencil size={18} />{t('finishProfile')}</button> : null}
      {status.next === 'payouts' ? <a className="pl-btn pl-btn--block" href="#payout-heading">{t('goPayout')}</a> : null}
      {status.next === 'approval' ? <p className="pl-registration__notice">{t('approvalNotice')}</p> : null}
    </section>

    <section className="pl-registration__section" aria-label={t('performerMyPublic')}>
      <h2 className="pl-h2">{t('performerMyPublic')}</h2>
      <div className="pl-registration__actions">
        <button className="pl-activity-card" onClick={onEdit}><Pencil size={20} /><strong>{t('stepProfile')}</strong><span>{t('editCardBody')}</span><em>{t('editAction')}</em></button>
        <button className="pl-activity-card" onClick={onPreview}><Share2 size={20} /><strong>{t('seePublic')}</strong><span>{t('hpQrHint')}</span><em>{t('seePublic')}</em></button>
        <button className="pl-activity-card" onClick={onPreview}><Share2 size={20} /><strong>{t('hpQr')}</strong><span>{t('hpQrHint')}</span><em>{t('hpQr')}</em></button>
      </div>
      {status.approved ? <button className="pl-btn pl-btn--ghost" onClick={() => void share()}><Share2 size={18} />{t('shareProfile')}</button> : null}
    </section>

    <section className="pl-registration__section" aria-label={t('performerMyActivity')}>
      <h2 className="pl-h2">{t('performerMyActivity')}</h2>
      <div className="pl-registration__actions">
        <button className="pl-activity-card" disabled={!status.approved} onClick={onLive}><Camera size={20} /><strong>{t('navLive')}</strong><span>{t('liveCardBody')}</span><em>{performer.is_live ? t('liveManage') : t('livePrepare')}</em></button>
        <button className="pl-activity-card" onClick={onSchedule}><CalendarDays size={20} /><strong>{t('scheduleTitle')}</strong><span>{t('scheduleCardBody')}</span><em>{t('scheduleAction')}</em></button>
        <button className="pl-activity-card" onClick={onHistory}><Camera size={20} /><strong>{t('liveHistory')}</strong><span>{t('liveHistoryMenu')}</span><em>{t('liveHistory')}</em></button>
      </div>
      {!status.approved ? <p className="pl-muted">{t('pendingNote')}</p> : null}
    </section>

    <PayoutSetup performerId={performer.id} onStatus={setConnect} />

    <section className="pl-registration__section" aria-label={t('performerMyRevenue')}>
      <h2 className="pl-h2">{t('performerMyRevenue')}</h2>
      <div className="pl-registration__actions">
        <button className="pl-activity-card" onClick={onEarnings}><WalletCards size={20} /><strong>{t('earnTitle')}</strong><span>{t('salesCardBody')}</span><em>{t('salesAction')}</em></button>
        <button className="pl-activity-card" onClick={onMerch}><ShoppingBag size={20} /><strong>{t('navGoods')}</strong><span>{t('merchCardBody')}</span><em>{t('merchAction')}</em></button>
      </div>
      <dl className="pl-registration__totals">
        <div><dt>{t('tipCount')}</dt><dd>{t('countItems', { n: summary.count })}</dd></div>
        <div><dt>{t('salesTotal')}</dt><dd>{formatYen(summary.amount_total)}</dd></div>
        <div><dt>{t('salesFee')}</dt><dd>{formatYen(summary.fee_total)}</dd></div>
      </dl>
      <p className="pl-muted">{t('tipSalesNote')}</p>
      <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={onEarnings}>{t('seeEarnings')}</button>
      {tips.map((tip) => <div key={tip.id} className="pl-registration__sale"><strong>{formatYen(tip.amount_cents)}</strong><span>{new Date(tip.created_at).toLocaleDateString('ja-JP')}</span></div>)}
    </section>

    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {message ? <p className="pl-registration__notice" role="status">{message}</p> : null}

    <section className="pl-registration__section" aria-label={t('performerMyAccount')}>
      <h2 className="pl-h2">{t('performerMyAccount')}</h2>
      <details className="pl-registration__details">
        <summary>パスワードを変更する</summary>
        <form onSubmit={(event) => {
          event.preventDefault()
          setPasswordFeedback(null)
          if (newPassword.length < 8) { setPasswordFeedback('新しいパスワードは8文字以上で入力してください。'); return }
          if (newPassword !== confirmPassword) { setPasswordFeedback('確認用パスワードが一致しません。'); return }
          setPasswordBusy(true)
          void updatePassword(newPassword).then((result) => {
            if (result) { setPasswordFeedback(result); return }
            setNewPassword('')
            setConfirmPassword('')
            setPasswordFeedback('パスワードを変更しました。次回から新しいパスワードでログインしてください。')
          }).catch(() => setPasswordFeedback('変更できませんでした。時間をおいて再度お試しください。'))
            .finally(() => setPasswordBusy(false))
        }}>
          <p className="pl-muted">ログイン中のアカウントのパスワードを変更できます。</p>
          <label className="pl-label" htmlFor="performer-new-password">新しいパスワード</label>
          <input id="performer-new-password" className="pl-input" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={passwordBusy} />
          <label className="pl-label" htmlFor="performer-confirm-password">新しいパスワード（確認）</label>
          <input id="performer-confirm-password" className="pl-input" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={passwordBusy} />
          <button type="submit" className="pl-btn pl-btn--block" disabled={passwordBusy}>{passwordBusy ? '変更中…' : 'パスワードを変更'}</button>
          {passwordFeedback ? <p role="status" className="pl-muted">{passwordFeedback}</p> : null}
        </form>
      </details>
      {onNotifications ? <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={onNotifications}>{t('notifications')}</button> : null}
      <details className="pl-registration__details"><summary>{t('liveHistoryMenu')}</summary>
        {recent.map((session) => <p key={session.id} className="pl-muted">{new Date(session.started_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ja-JP')}・{session.ended_at ? t('endedShort') : t('liveNow')}・{formatYen(session.tip_amount_total)}</p>)}
        <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={onHistory}>{t('liveHistory')}</button>
      </details>
      <label className="pl-registration__toggle"><input type="checkbox" checked={performer.share_location} disabled={busy} onChange={(e) => {
        const checked = e.target.checked
        setBusy(true)
        void updatePerformer(performer.id, { share_location: checked }).then(refreshProfile).catch((e) => setError(registrationError(e))).finally(() => setBusy(false))
      }} />{t('locationShare')}</label>
      {onOpenTitle ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" onClick={onOpenTitle}>{t('openTitleScreen')}</button> : null}
      <button className="pl-btn pl-btn--ghost pl-btn--block" onClick={() => void signOut()}>{t('signOut')}</button>
    </section>
  </div>
}
