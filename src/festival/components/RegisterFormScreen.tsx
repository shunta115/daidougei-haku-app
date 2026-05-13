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
  profile: '',
  achievements: '',
  snsUrl: '',
  website: '',
  photoUrl: '',
  tipUrl: '',
  preferredDates: '',
  notes: '',
}

type RegisterFormScreenProps = {
  /** 送信後に掲載完了画面へ渡す ID */
  onSuccess: (registrationId: string) => void
  onBack: () => void
  /** 直前の送信を再編集するときの登録 ID */
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
    profile: r.profile,
    achievements: r.achievements,
    snsUrl: r.snsUrl,
    website: r.website,
    photoUrl: r.photoUrl,
    tipUrl: r.tipUrl,
    preferredDates: r.preferredDates,
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
          profile: v.profile.trim(),
          achievements: v.achievements.trim(),
          snsUrl: v.snsUrl.trim(),
          website: v.website.trim(),
          photoUrl: v.photoUrl.trim(),
          tipUrl: v.tipUrl.trim(),
          preferredDates: v.preferredDates.trim(),
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
          Official registration
        </p>
        <h1 className="fe-page-head__title">出演者登録</h1>
        <p className="fe-page-head__lead">
          大道芸博への出演希望を受け付けます。送信後、運営が内容を確認し、承認された情報が公式アプリに掲載されます。
        </p>
        <p className="fe-form-note">
          <span className="fe-req">*</span> は必須です。
        </p>
      </header>

      <form className="fe-form" onSubmit={onSubmit}>
        <section className="fe-form-section" aria-labelledby="fe-reg-basic">
          <h2 id="fe-reg-basic" className="fe-form-section__title">
            基本情報
          </h2>

          <label className="fe-field">
            <span className="fe-label">
              アーティスト名 <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              name="artistName"
              value={v.artistName}
              onChange={patchField('artistName')}
              required
              autoComplete="nickname"
              placeholder="ステージ上のお名前"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              代表者名 <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              name="realName"
              value={v.realName}
              onChange={patchField('realName')}
              required
              autoComplete="name"
              placeholder="氏名（運営連絡用）"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              メールアドレス <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="email"
              inputMode="email"
              name="email"
              value={v.email}
              onChange={patchField('email')}
              required
              autoComplete="email"
              placeholder="contact@example.com"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              電話番号 <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="tel"
              inputMode="tel"
              name="phone"
              value={v.phone}
              onChange={patchField('phone')}
              required
              autoComplete="tel"
              placeholder="090-0000-0000"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              ジャンル <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              name="genre"
              value={v.genre}
              onChange={patchField('genre')}
              required
              placeholder="例: ジャグリング / マイム / 大道芸"
              enterKeyHint="next"
            />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-profile">
          <h2 id="fe-reg-profile" className="fe-form-section__title">
            プロフィール・実績
          </h2>

          <label className="fe-field">
            <span className="fe-label">
              プロフィール <span className="fe-req">*</span>
            </span>
            <textarea
              className="fe-textarea"
              name="profile"
              value={v.profile}
              onChange={patchField('profile')}
              required
              rows={5}
              placeholder="活動歴、スタイル、見どころなど"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              主な実績 <span className="fe-req">*</span>
            </span>
            <textarea
              className="fe-textarea"
              name="achievements"
              value={v.achievements}
              onChange={patchField('achievements')}
              required
              rows={4}
              placeholder="受賞歴、海外公演、メディア出演など"
            />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-links">
          <h2 id="fe-reg-links" className="fe-form-section__title">
            リンク・宣材
          </h2>

          <label className="fe-field">
            <span className="fe-label">
              SNSリンク <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="url"
              inputMode="url"
              name="snsUrl"
              value={v.snsUrl}
              onChange={patchField('snsUrl')}
              required
              placeholder="https://instagram.com/…"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              公式サイト <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="url"
              inputMode="url"
              name="website"
              value={v.website}
              onChange={patchField('website')}
              required
              placeholder="https://"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              宣材写真URL <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="url"
              inputMode="url"
              name="photoUrl"
              value={v.photoUrl}
              onChange={patchField('photoUrl')}
              required
              placeholder="画像直リンク or クラウドURL"
              enterKeyHint="next"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">
              投げ銭リンク <span className="fe-req">*</span>
            </span>
            <input
              className="fe-input"
              type="url"
              inputMode="url"
              name="tipUrl"
              value={v.tipUrl}
              onChange={patchField('tipUrl')}
              required
              placeholder="PayPal / Kyash / 投げ銭サービスURL"
              enterKeyHint="next"
            />
          </label>
        </section>

        <section className="fe-form-section" aria-labelledby="fe-reg-extra">
          <h2 id="fe-reg-extra" className="fe-form-section__title">
            出演・その他
          </h2>

          <label className="fe-field">
            <span className="fe-label">
              出演希望日 <span className="fe-req">*</span>
            </span>
            <textarea
              className="fe-textarea"
              name="preferredDates"
              value={v.preferredDates}
              onChange={patchField('preferredDates')}
              required
              rows={3}
              placeholder="例: 11/8 午後希望、全日可 など"
            />
          </label>

          <label className="fe-field">
            <span className="fe-label">備考</span>
            <textarea
              className="fe-textarea"
              name="notes"
              value={v.notes}
              onChange={patchField('notes')}
              rows={3}
              placeholder="機材・スペース・時間など、伝えておきたいことがあれば"
            />
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
