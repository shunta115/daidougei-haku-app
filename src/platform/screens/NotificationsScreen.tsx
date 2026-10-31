import { useEffect, useState } from 'react'
import { disableAppearancePush, disableLiveStartPush, enableAppearancePush, enableLiveStartPush, getLivePushPreference, getNotificationPreference, listNotifications, liveStartWebPushEnabled, markNotificationRead } from '../lib/api'
import { supabaseAuthHeaders } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { NotificationRow } from '../lib/types'
import { AppBackButton } from '../components/AppBackButton'
import { useLang } from '../../i18n/LangProvider'
import { startNotificationRefresh } from '../lib/notificationRefresh'
import { ensureTodayAppearanceReminders } from '../lib/appearanceReminders'

type Props = {
  onOpenLive?: (performerId: string) => void
  onOpenPerformer?: (performerId: string) => void
  onOpenSchedule?: (performerId: string, appearanceId: string) => void
  onBack?: () => void
}

function parseLink(link: string | null): { kind: 'live' | 'profile'; id: string; appearanceId?: string } | null {
  if (!link) return null
  try {
    const parsed = new URL(link, window.location.origin)
    const performerId = parsed.searchParams.get('profile')
    const appearanceId = parsed.searchParams.get('schedule')
    if (performerId && appearanceId) return { kind: 'profile', id: performerId, appearanceId }
  } catch { /* legacy link */ }
  if (link.startsWith('live:')) return { kind: 'live', id: link.slice(5) }
  const hashLive = link.match(/#?live\/([0-9a-f-]{36})/i)
  if (hashLive) return { kind: 'live', id: hashLive[1] }
  const profile = link.match(/#?profile\/([0-9a-f-]{36})/i)
  if (profile) return { kind: 'profile', id: profile[1] }
  return null
}

export function NotificationsScreen({ onOpenLive, onOpenPerformer, onOpenSchedule, onBack }: Props) {
  const { user } = useAuth()
  const { lang } = useLang()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [livePushAvailable, setLivePushAvailable] = useState(false)
  const [livePushOn, setLivePushOn] = useState(false)
  const [livePushBusy, setLivePushBusy] = useState(false)

  const [testResult, setTestResult] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const sendSelfTest = async () => {
    if (testBusy || testResult) return
    setTestBusy(true)
    try {
      const response = await fetch('/api/notifications/self-test', {
        method: 'POST', headers: { ...await supabaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'send_one_self_test' }),
      })
      const result = await response.json()
      setTestResult(response.ok ? '送信を受け付けました。iPhoneの通知をご確認ください。' : `送信停止: ${result.error || response.status}（再送しないでください）`)
    } catch { setTestResult('結果を確認できません。再送せず管理者に確認してください。') }
    finally { setTestBusy(false) }
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      await ensureTodayAppearanceReminders().catch(() => undefined)
      const next = await listNotifications(user.id)
      setRows(next)
      setError(null)
    }
    return startNotificationRefresh(() => load().catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed')
    }))
  }, [user])

  useEffect(() => {
    if (!user || !liveStartWebPushEnabled) return
    let active = true
    void getLivePushPreference(user.id).then((value) => {
      if (active) { setLivePushAvailable(value.available); setLivePushOn(value.enabled) }
    }).catch(() => { if (active) setLivePushAvailable(false) })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user) return
    getNotificationPreference(user.id).then((value) => setPushOn(value.appearance_push_enabled)).catch(() => setPushOn(false))
  }, [user])

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      await markNotificationRead(n.id)
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)))
    }
    const parsed = parseLink(n.link)
    if (!parsed) return
    if (parsed.kind === 'live') onOpenLive?.(parsed.id)
    else if (parsed.appearanceId) onOpenSchedule?.(parsed.id, parsed.appearanceId)
    else onOpenPerformer?.(parsed.id)
  }

  const togglePush = async () => {
    if (!user || pushBusy || livePushBusy) return
    setPushBusy(true); setError(null)
    try {
      if (pushOn) await disableAppearancePush(user.id, lang)
      else await enableAppearancePush(user.id, lang)
      setPushOn(!pushOn)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      const messages = lang === 'en'
        ? { denied: 'Notifications are blocked. Allow HAKU notifications in iPhone Settings.', unsupported: 'On iPhone, add HAKU to the Home Screen from Safari before enabling notifications.', failed: 'Push notifications could not be configured.' }
        : lang === 'zh-TW'
          ? { denied: '通知權限已被拒絕。請在iPhone設定中允許HAKU通知。', unsupported: 'iPhone請先從Safari將HAKU加入主畫面，再開啟通知。', failed: '無法設定Push通知。' }
          : { denied: '通知が許可されていません。iPhoneの設定からHAKUの通知を許可してください。', unsupported: 'iPhoneではSafariからホーム画面に追加したHAKUで通知を有効にしてください。', failed: 'Push通知を設定できませんでした。' }
      setError(code === 'push_denied' ? messages.denied : code === 'push_unsupported' || code === 'push_home_screen_required' ? messages.unsupported : messages.failed)
    } finally { setPushBusy(false) }
  }

  const toggleLivePush = async () => {
    if (!user || !livePushAvailable || livePushBusy || pushBusy) return
    setLivePushBusy(true); setError(null)
    try {
      if (livePushOn) await disableLiveStartPush(user.id, lang)
      else await enableLiveStartPush(user.id, lang)
      setLivePushOn(!livePushOn)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      if (code === 'live_push_unavailable') {
        setLivePushAvailable(false)
        setError(lang === 'en' ? 'LIVE Push is not available in this environment. In-app alerts are still available.' : lang === 'zh-TW' ? '此環境暫時無法使用直播Push通知，仍可查看HAKU內通知。' : 'この環境ではLIVEのPush通知を利用できません。HAKU内通知をご利用ください。')
      } else {
        setError(lang === 'en' ? 'Allow notifications in Settings. On iPhone, open HAKU from the Home Screen before enabling Push.' : lang === 'zh-TW' ? '請在設定允許通知。iPhone請從主畫面開啟HAKU後設定Push通知。' : '通知の許可を確認してください。iPhoneではホーム画面に追加したHAKUからPush通知を設定してください。')
      }
    } finally { setLivePushBusy(false) }
  }

  return (
    <>
      {onBack ? <AppBackButton onClick={onBack} label="戻る" /> : null}
      <h1 className="pl-h1">Notifications</h1>
      {user && new URLSearchParams(window.location.search).get('pushSelfTest') === '1' ? <section className="pl-registration__section"><h2 className="pl-h2">本人端末の通知テスト</h2><button type="button" className="pl-btn" disabled={testBusy || Boolean(testResult)} onClick={() => void sendSelfTest()}>HAKUプッシュ通知テストを1件送信</button><p role="status">{testResult}</p></section> : null}
      {user ? <section className="pl-registration__section pl-notification-settings"><h2 className="pl-h2">{lang === 'en' ? 'Performance alerts' : lang === 'zh-TW' ? '演出通知' : '出演予定の通知'}</h2><p className="pl-muted">{lang === 'en' ? 'In-app alerts are available without Push. On iPhone, add HAKU to the Home Screen before enabling Push.' : lang === 'zh-TW' ? '即使未開啟Push，也可在HAKU內查看通知。iPhone請先將HAKU加入主畫面。' : 'Pushを許可しなくてもHAKU内通知は確認できます。iPhoneでは先にSafariからホーム画面へ追加してください。'}</p><button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={pushBusy || livePushBusy} aria-pressed={pushOn} onClick={() => void togglePush()}>{pushOn ? (lang === 'en' ? 'Disable Push' : lang === 'zh-TW' ? '關閉Push通知' : 'Push通知をオフ') : (lang === 'en' ? 'Enable Push' : lang === 'zh-TW' ? '開啟Push通知' : 'Push通知をオン')}</button></section> : null}
      {user && liveStartWebPushEnabled ? <section className="pl-registration__section pl-notification-settings">
        <h2 className="pl-h2">{lang === 'en' ? 'LIVE start alerts' : lang === 'zh-TW' ? '直播開始通知' : 'LIVE開始の通知'}</h2>
        <p className="pl-muted">{lang === 'en' ? 'Get a Push when a performer you follow starts LIVE. On iPhone, use HAKU added to the Home Screen and allow notifications.' : lang === 'zh-TW' ? '追蹤的表演者開始直播時接收Push通知。iPhone請使用已加入主畫面的HAKU並允許通知。' : 'フォロー中のパフォーマーがLIVEを始めたらPushでお知らせします。iPhoneではホーム画面に追加したHAKUで通知を許可してください。'}</p>
        {!livePushAvailable ? <p className="pl-muted" role="status">{lang === 'en' ? 'LIVE Push is unavailable here. In-app alerts remain available.' : lang === 'zh-TW' ? '此環境暫時無法使用直播Push，仍可查看HAKU內通知。' : 'この環境ではLIVEのPush通知を利用できません。HAKU内通知は確認できます。'}</p> : null}
        <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={!livePushAvailable || livePushBusy || pushBusy} aria-pressed={livePushOn} onClick={() => void toggleLivePush()}>{livePushOn ? (lang === 'en' ? 'Disable LIVE Push' : lang === 'zh-TW' ? '關閉直播Push' : 'LIVEのPush通知をオフ') : (lang === 'en' ? 'Enable LIVE Push' : lang === 'zh-TW' ? '開啟直播Push' : 'LIVEのPush通知をオン')}</button>
      </section> : null}
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.length === 0 && !error ? <div className="pl-empty">No notifications.</div> : null}
      {rows.map((n) => (
        <button
          key={n.id}
          type="button"
          className="pl-card"
          style={{ width: '100%', textAlign: 'left', opacity: n.read_at ? 0.65 : 1, cursor: 'pointer' }}
          onClick={() => void open(n)}
        >
          <div style={{ fontWeight: 700 }}>{n.kind === 'appearance' ? appearanceCopy(n, lang).title : n.title}</div>
          <div className="pl-muted">{n.kind === 'appearance' ? appearanceCopy(n, lang).body : n.body}</div>
          <div className="pl-muted">{new Date(n.created_at).toLocaleString()}</div>
        </button>
      ))}
    </>
  )
}

function appearanceCopy(row: NotificationRow, lang: 'ja' | 'en' | 'zh-TW') {
  const meta = row.meta ?? {}
  const kind = String(meta.eventType ?? '')
  const name = String(meta.stageName ?? '')
  const title = String(meta.title ?? '')
  if (lang === 'en') return { title: kind === 'day_of' ? 'Performance today' : kind === 'cancelled' ? 'Performance cancelled' : kind === 'postponed' ? 'Performance postponed' : kind === 'important_update' ? 'Performance updated' : 'New performance announced', body: `${name}: ${title}` }
  if (lang === 'zh-TW') return { title: kind === 'day_of' ? '今天的演出預定' : kind === 'cancelled' ? '演出取消通知' : kind === 'postponed' ? '演出延期通知' : kind === 'important_update' ? '演出資訊已更新' : '新的演出預定', body: `${name}：${title}` }
  return { title: kind === 'day_of' ? '本日の出演予定' : kind === 'cancelled' ? '出演中止のお知らせ' : kind === 'postponed' ? '出演延期のお知らせ' : kind === 'important_update' ? '出演予定が変更されました' : '新しい出演予定', body: `${name}・${title}` }
}
