import { useCallback, useState } from 'react'
import {
  appendRegistration,
  readRegistrations,
  updateRegistrationContent,
} from '../lib/registrationsStorage'
import type { RegistrationDraft } from '../lib/registrationsStorage'

const emptyDraft: RegistrationDraft = {
  artistName: '',
  realName: '',
  email: '',
  phone: '',
  genre: '',
  activityBase: '',
  profile: '',
  achievements: '',
  snsUrl: '',
  website: '',
  photoUrl: '',
  tipUrl: '',
  preferredDates: '',
  preferredStage: '',
  videoUrl: '',
  staffNote: '',
  notes: '',
}

type RegisterFormScreenProps = {
  onSuccess: (registrationId: string) => void
  onBack: () => void
  editRegistrationId?: string | null
}

function draftFromRegistrationId(id: string): RegistrationDraft | null {
  const r = readRegistrations().find((x) => x.id === id)
  if (!r) return null
  return {
    artistName: r.artistName,
    realName: r.realName,
    email: r.email,
    phone: r.phone,
    genre: r.genre,
    activityBase: r.activityBase ?? '',
    profile: r.profile,
    achievements: r.achievements,
    snsUrl: r.snsUrl,
    website: r.website,
    photoUrl: r.photoUrl,
    tipUrl: r.tipUrl,
    preferredDates: r.preferredDates,
    preferredStage: r.preferredStage ?? '',
    videoUrl: r.videoUrl ?? '',
    staffNote: r.staffNote ?? '',
    notes: r.notes,
  }
}

export function RegisterFormScreen({ onSuccess, onBack, editRegistrationId }: RegisterFormScreenProps) {
  const [v, setV] = useState<RegistrationDraft>(() => {
    if (!editRegistrationId) return emptyDraft
    return draftFromRegistrationId(editRegistrationId) ?? emptyDraft
  })
  const [busy, setBusy] = useState(false)

  const patchField =
    (key: keyof RegistrationDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setV((s) => ({ ...s, [key]: e.target.value }))
    }

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setBusy(true)
      try {
        const draft: RegistrationDraft = {
          artistName: v.artistName.trim(),
          realName: v.realName.trim(),
          email: v.email.trim(),
          phone: v.phone.trim(),
          genre: v.genre.trim(),
          activityBase: v.activityBase.trim(),
          profile: v.profile.trim(),
          achievements: v.achievements.trim(),
          snsUrl: v.snsUrl.trim(),
          website: v.website.trim(),
          photoUrl: v.photoUrl.trim(),
          tipUrl: v.tipUrl.trim(),
          preferredDates: v.preferredDates.trim(),
          preferredStage: v.preferredStage.trim(),
          videoUrl: v.videoUrl.trim(),
          staffNote: v.staffNote.trim(),
          notes: v.notes.trim(),
        }
        if (editRegistrationId) {
          const ok = updateRegistrationContent(editRegistrationId, draft)
          if (ok) onSuccess(editRegistrationId)
        } else {
          const row = appendRegistration(draft)
          setV(emptyDraft)
          onSuccess(row.id)
        }
      } finally {
        setBusy(false)
      }
    },
    [onSuccess, v, editRegistrationId],
  )

  const isEdit = Boolean(editRegistrationId)

  return (
    <main className="fe-main fe-main--form">
      <header className="fe-page-head">
        <button type="button" className="fe-page-head__back" onClick={onBack}>
          ← 戻る
        </button>
        <p className="fe-page-head__eyebrow" lang="en">
          OFFICIAL ENTRY
        </p>
        <h1 className="fe-page-head__title">パフォーマー登録</h1>
        <p className="fe-page-head__lead">
          大道芸博への出演希望。送信後は運営ダッシュボードで確認・編集できます（この端末の localStorage · デモ）。
        </p>
        <p className="fe-form-note">
          <span className="fe-req">*</span> は必須です。
        </p>
      </header>

      <form className="fe-form" onSubmit={onSubmit}>
        <section className="fe-form-section" aria-labelledby="fe-reg-a">
          <h2 id="fe-reg-a" className="fe-form-section__title">
            アーティスト
          </h2>
          <label className="fe-field">
            <span className="fe-label">
              アーティスト名 <span className="fe-req">*</span>
            </span>
            <input className="fe-input" value={v.artistName} onChange={patchField('artistName')} required placeholder="ステージ名" />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              ジャンル <span className="fe-req">*</span>
            </span>
            <input className="fe-input" value={v.genre} onChange={patchField('genre')} required placeholder="例: ジャグリング / マイム" />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              活動拠点 <span className="fe-req">*</span>
            </span>
            <input className="fe-input" value={v.activityBase} onChange={patchField('activityBase')} required placeholder="例: 横浜 / 関東圏" />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-b">
          <h2 id="fe-reg-b" className="fe-form-section__title">
            プロフィール
          </h2>
          <label className="fe-field">
            <span className="fe-label">
              プロフィール <span className="fe-req">*</span>
            </span>
            <textarea className="fe-textarea" rows={5} value={v.profile} onChange={patchField('profile')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              過去出演歴 <span className="fe-req">*</span>
            </span>
            <textarea className="fe-textarea" rows={4} value={v.achievements} onChange={patchField('achievements')} required />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-c">
          <h2 id="fe-reg-c" className="fe-form-section__title">
            宣材 · リンク
          </h2>
          <label className="fe-field">
            <span className="fe-label">
              宣材写真URL <span className="fe-req">*</span>
            </span>
            <input className="fe-input" type="url" value={v.photoUrl} onChange={patchField('photoUrl')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              SNS <span className="fe-req">*</span>
            </span>
            <input className="fe-input" type="url" value={v.snsUrl} onChange={patchField('snsUrl')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              公式サイト <span className="fe-req">*</span>
            </span>
            <input className="fe-input" type="url" value={v.website} onChange={patchField('website')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">動画URL</span>
            <input className="fe-input" type="url" value={v.videoUrl} onChange={patchField('videoUrl')} placeholder="https://…" />
          </label>
          <label className="fe-field">
            <span className="fe-label">サポート用URL（任意）</span>
            <input className="fe-input" type="url" value={v.tipUrl} onChange={patchField('tipUrl')} placeholder="応援リンクがある場合" />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-d">
          <h2 id="fe-reg-d" className="fe-form-section__title">
            出演希望
          </h2>
          <label className="fe-field">
            <span className="fe-label">
              希望出演日 <span className="fe-req">*</span>
            </span>
            <textarea className="fe-textarea" rows={3} value={v.preferredDates} onChange={patchField('preferredDates')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              希望ステージ <span className="fe-req">*</span>
            </span>
            <input className="fe-input" value={v.preferredStage} onChange={patchField('preferredStage')} required />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-e">
          <h2 id="fe-reg-e" className="fe-form-section__title">
            運営連絡
          </h2>
          <label className="fe-field">
            <span className="fe-label">代表者名（任意）</span>
            <input className="fe-input" value={v.realName} onChange={patchField('realName')} />
          </label>
          <label className="fe-field">
            <span className="fe-label">メール（任意）</span>
            <input className="fe-input" type="email" value={v.email} onChange={patchField('email')} />
          </label>
          <label className="fe-field">
            <span className="fe-label">電話（任意）</span>
            <input className="fe-input" type="tel" value={v.phone} onChange={patchField('phone')} />
          </label>
          <label className="fe-field">
            <span className="fe-label">
              運営への連絡事項 <span className="fe-req">*</span>
            </span>
            <textarea className="fe-textarea" rows={3} value={v.staffNote} onChange={patchField('staffNote')} required />
          </label>
          <label className="fe-field">
            <span className="fe-label">その他メモ（任意）</span>
            <textarea className="fe-textarea" rows={2} value={v.notes} onChange={patchField('notes')} />
          </label>
        </section>

        <div className="fe-form-actions">
          <button type="submit" className="fe-btn fe-btn--primary fe-btn--block" disabled={busy}>
            {busy ? '送信中…' : isEdit ? '内容を更新する' : '送信する'}
          </button>
          <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onBack}>
            キャンセル
          </button>
        </div>
      </form>
    </main>
  )
}
