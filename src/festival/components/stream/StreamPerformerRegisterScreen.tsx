import { useCallback, useState } from 'react'
import { appendStreamApplication, type StreamApplicationDraft } from '../../lib/streamApplicationsStorage'

const empty: StreamApplicationDraft = {
  performerName: '',
  realName: '',
  email: '',
  activityRegion: '',
  genre: '',
  snsUrl: '',
  streamDescription: '',
  reviewMessage: '',
}

type StreamPerformerRegisterScreenProps = {
  onSuccess: () => void
  onBack: () => void
}

export function StreamPerformerRegisterScreen({ onSuccess, onBack }: StreamPerformerRegisterScreenProps) {
  const [v, setV] = useState(empty)
  const [busy, setBusy] = useState(false)

  const patch =
    (key: keyof StreamApplicationDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setV((s) => ({ ...s, [key]: e.target.value }))
    }

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setBusy(true)
      try {
        appendStreamApplication({
          performerName: v.performerName.trim(),
          realName: v.realName.trim(),
          email: v.email.trim(),
          activityRegion: v.activityRegion.trim(),
          genre: v.genre.trim(),
          snsUrl: v.snsUrl.trim(),
          streamDescription: v.streamDescription.trim(),
          reviewMessage: v.reviewMessage.trim(),
        })
        onSuccess()
      } finally {
        setBusy(false)
      }
    },
    [v, onSuccess],
  )

  return (
    <main className="fe-main fe-main--stream-reg">
      <header className="fe-page-head">
        <button type="button" className="fe-page-head__back" onClick={onBack}>
          ← 戻る
        </button>
        <p className="fe-page-head__eyebrow">Stream Performer</p>
        <h1 className="fe-page-head__title">配信希望パフォーマー登録</h1>
        <p className="fe-page-head__lead">
          事前登録 · 事務局審査後、承認されたパフォーマーのみ配信可能です。世界中どこからでも配信できます。
        </p>
      </header>

      <form className="fe-form fe-stream-reg-form" onSubmit={onSubmit}>
        <label className="fe-field">
          <span className="fe-label">パフォーマー名（活動名）*</span>
          <input className="fe-input" required value={v.performerName} onChange={patch('performerName')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">本名 *</span>
          <input className="fe-input" required value={v.realName} onChange={patch('realName')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">メールアドレス *</span>
          <input className="fe-input" type="email" required value={v.email} onChange={patch('email')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">活動地域（国・都市）*</span>
          <input className="fe-input" required value={v.activityRegion} onChange={patch('activityRegion')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">ジャンル *</span>
          <input className="fe-input" required value={v.genre} onChange={patch('genre')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">SNS / 公式サイト URL</span>
          <input className="fe-input" type="url" value={v.snsUrl} onChange={patch('snsUrl')} placeholder="https://" />
        </label>
        <label className="fe-field">
          <span className="fe-label">配信したい内容 *</span>
          <textarea className="fe-textarea" rows={4} required value={v.streamDescription} onChange={patch('streamDescription')} />
        </label>
        <label className="fe-field">
          <span className="fe-label">審査用メッセージ *</span>
          <textarea className="fe-textarea" rows={3} required value={v.reviewMessage} onChange={patch('reviewMessage')} />
        </label>
        <button type="submit" className="fe-btn fe-btn--primary fe-btn--block" disabled={busy}>
          登録を送信する
        </button>
      </form>
    </main>
  )
}
