import { useCallback, useState } from 'react'
import { registrationToEditable } from '../../lib/registrationsStorage'
import type { EditableRegistrationFields, PerformerRegistration, RegistrationStatus } from '../../types'

const STATUS_OPTIONS: { value: RegistrationStatus; label: string }[] = [
  { value: 'pending', label: '未確認' },
  { value: 'approved', label: '承認済み' },
  { value: 'hidden', label: '非公開' },
]

type RegistrationEditFormProps = {
  initial: PerformerRegistration
  onSave: (fields: EditableRegistrationFields) => void
  onCancel: () => void
}

export function RegistrationEditForm({ initial, onSave, onCancel }: RegistrationEditFormProps) {
  const [v, setV] = useState<EditableRegistrationFields>(() => registrationToEditable(initial))

  const patch =
    (key: keyof EditableRegistrationFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setV((s: EditableRegistrationFields) => ({ ...s, [key]: e.target.value }))
    }

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onSave({
        ...v,
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
      })
    },
    [onSave, v],
  )

  return (
    <form className="fe-admin-edit" onSubmit={submit}>
      <p className="fe-admin-edit__title">登録内容を編集</p>

      <label className="fe-field">
        <span className="fe-label">アーティスト名</span>
        <input className="fe-input" value={v.artistName} onChange={patch('artistName')} required />
      </label>
      <label className="fe-field">
        <span className="fe-label">代表者名</span>
        <input className="fe-input" value={v.realName} onChange={patch('realName')} required />
      </label>
      <label className="fe-field">
        <span className="fe-label">メール</span>
        <input className="fe-input" type="email" value={v.email} onChange={patch('email')} required />
      </label>
      <label className="fe-field">
        <span className="fe-label">電話</span>
        <input className="fe-input" type="tel" value={v.phone} onChange={patch('phone')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">ジャンル</span>
        <input className="fe-input" value={v.genre} onChange={patch('genre')} required />
      </label>
      <label className="fe-field">
        <span className="fe-label">プロフィール</span>
        <textarea className="fe-textarea" rows={4} value={v.profile} onChange={patch('profile')} required />
      </label>
      <label className="fe-field">
        <span className="fe-label">主な実績</span>
        <textarea className="fe-textarea" rows={3} value={v.achievements} onChange={patch('achievements')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">SNS</span>
        <input className="fe-input" type="url" value={v.snsUrl} onChange={patch('snsUrl')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">公式サイト</span>
        <input className="fe-input" type="url" value={v.website} onChange={patch('website')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">宣材写真URL</span>
        <input className="fe-input" type="url" value={v.photoUrl} onChange={patch('photoUrl')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">投げ銭</span>
        <input className="fe-input" type="url" value={v.tipUrl} onChange={patch('tipUrl')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">出演希望日</span>
        <textarea className="fe-textarea" rows={2} value={v.preferredDates} onChange={patch('preferredDates')} />
      </label>
      <label className="fe-field">
        <span className="fe-label">備考</span>
        <textarea className="fe-textarea" rows={2} value={v.notes} onChange={patch('notes')} />
      </label>

      <label className="fe-field">
        <span className="fe-label">承認ステータス</span>
        <select
          className="fe-select"
          value={v.status}
          onChange={(e) =>
            setV((s: EditableRegistrationFields) => ({ ...s, status: e.target.value as RegistrationStatus }))
          }
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="fe-admin-edit__actions">
        <button type="submit" className="fe-btn fe-btn--primary fe-btn--block">
          保存
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  )
}
