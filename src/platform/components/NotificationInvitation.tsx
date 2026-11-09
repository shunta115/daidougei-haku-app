import { useEffect, useState } from 'react'
import { claimNotificationPrompt, NOTIFICATION_PROMPT_EVENT, type NotificationPromptReason } from '../lib/notificationPrompt'
import { pushEnvironment } from '../lib/pushEnvironment'
import { PushSetupGuide } from './PushSetupGuide'

export function NotificationInvitation({ userId, onSettings }: { userId: string; onSettings: () => void }) {
  const [reason, setReason] = useState<NotificationPromptReason | null>(null)
  useEffect(() => {
    setReason(null)
    const show = (next: NotificationPromptReason) => {
      const env = pushEnvironment()
      if (env.denied || (!env.supported && !env.needsInstall) || ('Notification' in window && Notification.permission === 'granted')) return
      if (claimNotificationPrompt(userId)) setReason(next)
    }
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.userId === userId && ['follow', 'reservation'].includes(detail.reason)) show(detail.reason)
    }
    window.addEventListener(NOTIFICATION_PROMPT_EVENT, listener)
    show('login')
    return () => window.removeEventListener(NOTIFICATION_PROMPT_EVENT, listener)
  }, [userId])
  if (!reason) return null
  return <aside className="pl-card" aria-label="通知のご案内">
    <h2 className="pl-h2">{reason === 'reservation' ? '予約したLIVEを見逃さないために' : reason === 'follow' ? 'フォローした活動の通知を受け取れます' : '好きなパフォーマーの活動をチェック'}</h2>
    <p>通知は初期OFFです。設定で受け取りたいカテゴリを選べます。許可しなくてもHAKU内通知を確認できます。</p>
    <button type="button" className="pl-btn" onClick={() => { setReason(null); onSettings() }}>通知設定を確認する</button>
    <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setReason(null)}>今はしない</button>
    <PushSetupGuide />
  </aside>
}
