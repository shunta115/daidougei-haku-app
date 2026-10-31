import { useEffect, useState } from 'react'
import { ensurePushSubscription } from '../lib/api'
import { getSmartPushPreference, saveSmartPushPreference, type SmartPushPreference } from '../lib/smartPush'
import { pushEnvironment } from '../lib/pushEnvironment'
import { PushSetupGuide } from './PushSetupGuide'

export function SmartPushSettings({ userId }: { userId: string }) {
  const [pref, setPref] = useState<SmartPushPreference | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { let active = true; setPref(null); void getSmartPushPreference(userId).then(value => { if (active) setPref(value) }).catch(() => { if (active) setMessage('通知設定を読み込めませんでした。接続を確認してください。') }); return () => { active = false } }, [userId])
  const env = pushEnvironment()
  const update = async (patch: Partial<SmartPushPreference>) => {
    if (busy || !pref) return
    setBusy(true); setMessage('')
    try {
      // Keep OS permission within the explicit user click; do not request it on mount.
      if (patch.live_push_enabled || patch.appearance_push_enabled) await ensurePushSubscription(userId)
      if (patch.push_all_enabled === false) {
        patch.appearance_push_enabled = false
        patch.live_push_enabled = false
      }
      await saveSmartPushPreference(userId, { ...patch, push_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
      setPref(current => current ? { ...current, ...patch } : current)
      setMessage('通知設定を保存しました。')
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      setMessage(code === 'push_denied' ? '通知が拒否されています。下の設定ガイドをご確認ください。' : code === 'push_unsupported' ? 'ホーム画面からHAKUを起動してください。' : '通知設定を保存できませんでした。設定と接続を確認してください。')
    } finally { setBusy(false) }
  }
  return <section className="pl-registration__section" aria-label="SMART PUSH通知設定"><h2 className="pl-h2">好きなパフォーマーのLIVEを見逃さない！</h2>
    <p className="pl-muted">フォロー中で、あなたがONにした通知だけを受け取れます。販促・フォロワー個人情報の通知はありません。</p>
    {pref ? <fieldset disabled={busy}><legend>プッシュ通知</legend>
      <label><input type="checkbox" checked={pref.push_all_enabled} onChange={e => void update({ push_all_enabled:e.target.checked })} />プッシュ通知を許可する（OFFで全停止）</label>
      <label><input type="checkbox" checked={pref.live_push_enabled} disabled={!pref.push_all_enabled || env.needsInstall || !env.supported || env.denied} onChange={e => void update({ live_push_enabled:e.target.checked })} />フォロー中パフォーマーのLIVE開始</label>
      <label><input type="checkbox" checked={pref.appearance_push_enabled} disabled={!pref.push_all_enabled || env.needsInstall || !env.supported || env.denied} onChange={e => void update({ appearance_push_enabled:e.target.checked })} />フォロー中パフォーマーの出演予定</label>
      <p className="pl-muted">カテゴリの同意はそれぞれ独立しています。全停止を解除した後は、必要なカテゴリを選び直してください。</p>
      <label>受信開始（時）<input className="pl-input" type="number" min="0" max="23" value={pref.push_start_hour} onChange={e => { const n=Number(e.target.value); if(Number.isInteger(n)&&n>=0&&n<=23) void update({push_start_hour:n}) }} /></label>
      <label>受信終了（時）<input className="pl-input" type="number" min="0" max="23" value={pref.push_end_hour} onChange={e => { const n=Number(e.target.value); if(Number.isInteger(n)&&n>=0&&n<=23) void update({push_end_hour:n}) }} /></label>
      <label>1日の上限<select className="pl-input" value={pref.push_daily_limit} onChange={e => void update({push_daily_limit:Number(e.target.value)})}>{[0,1,2].map(n=><option key={n} value={n}>{n}件</option>)}</select></label>
      <label>週の上限<select className="pl-input" value={pref.push_weekly_limit} onChange={e => void update({push_weekly_limit:Number(e.target.value)})}>{Array.from({length:9},(_,n)=><option key={n} value={n}>{n}件</option>)}</select></label>
      <p className="pl-muted">現地時間：{Intl.DateTimeFormat().resolvedOptions().timeZone}。終了したLIVEの通知を翌朝へ繰り越すことはありません。</p>
    </fieldset> : <p>通知機能の準備中です。HAKU内通知をご利用ください。</p>}
    <p role="status">{message}</p><PushSetupGuide />
  </section>
}
