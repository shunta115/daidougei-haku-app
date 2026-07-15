import { useCallback, useState } from 'react'
import {
  deleteRegistration,
  readRegistrations,
  updateRegistrationRecord,
  updateRegistrationStatus,
} from '../../lib/registrationsStorage'
import type { EditableRegistrationFields, PerformerRegistration, RegistrationStatus } from '../../types'
import { RegistrationEditForm } from './RegistrationEditForm'

const STATUS_OPTIONS: { value: RegistrationStatus; label: string }[] = [
  { value: 'pending', label: '未確認' },
  { value: 'approved', label: '承認済み' },
  { value: 'hidden', label: '非公開' },
]

function statusClass(s: RegistrationStatus) {
  if (s === 'approved') return 'fe-admin-badge fe-admin-badge--ok'
  if (s === 'hidden') return 'fe-admin-badge fe-admin-badge--off'
  return 'fe-admin-badge fe-admin-badge--pending'
}

function formatJaDate(iso: string) {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return iso
  }
}

export function AdminRegistrationsList() {
  const [items, setItems] = useState<PerformerRegistration[]>(() => readRegistrations())
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setItems(readRegistrations())
  }, [])

  const onStatus = useCallback(
    (id: string, status: RegistrationStatus) => {
      updateRegistrationStatus(id, status)
      refresh()
    },
    [refresh],
  )

  const onSaveEdit = useCallback(
    (id: string, fields: EditableRegistrationFields) => {
      updateRegistrationRecord(id, fields)
      setEditingId(null)
      refresh()
    },
    [refresh],
  )

  const onDelete = useCallback(
    (id: string, name: string) => {
      if (!window.confirm(`「${name || '無題'}」の登録を削除しますか？この操作は元に戻せません。`)) return
      deleteRegistration(id)
      setOpenId(null)
      setEditingId(null)
      refresh()
    },
    [refresh],
  )

  if (items.length === 0) {
    return (
      <div className="fe-admin-empty">
        <p>まだ登録がありません。</p>
        <p className="fe-admin-empty__hint">来場者トップの「パフォーマー登録」から送信できます。</p>
      </div>
    )
  }

  return (
    <ul className="fe-admin-list">
      {items.map((r) => {
        const open = openId === r.id
        const editing = editingId === r.id
        return (
          <li key={r.id} className="fe-admin-card">
            <div className="fe-admin-card__top">
              <div className="fe-admin-card__who">
                <h2 className="fe-admin-card__name">{r.artistName || '（無題）'}</h2>
                <p className="fe-admin-card__meta">
                  {r.genre ? <span>{r.genre}</span> : null}
                  {r.genre && (r.realName || r.email) ? <span> · </span> : null}
                  {r.realName ? <span>{r.realName}</span> : null}
                  {r.realName && r.email ? <span> · </span> : null}
                  {r.email ? <span>{r.email}</span> : null}
                  {!r.genre && !r.realName && !r.email ? <span>—</span> : null}
                </p>
                <p className="fe-admin-card__date">{formatJaDate(r.createdAt)}</p>
              </div>
              <div className="fe-admin-card__controls">
                <span className={statusClass(r.status)}>
                  {STATUS_OPTIONS.find((o) => o.value === r.status)?.label ?? r.status}
                </span>
                <label className="fe-admin-select-wrap">
                  <span className="fe-sr-only">承認ステータス</span>
                  <select
                    className="fe-select"
                    value={r.status}
                    onChange={(e) => onStatus(r.id, e.target.value as RegistrationStatus)}
                    aria-label={`${r.artistName} のステータス`}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="fe-admin-card__actions">
              <button
                type="button"
                className="fe-admin-toggle"
                onClick={() => {
                  if (open) {
                    setOpenId(null)
                    setEditingId(null)
                  } else {
                    setOpenId(r.id)
                  }
                }}
                aria-expanded={open}
              >
                {open ? '詳細を閉じる' : '詳細を表示'}
              </button>
              <button
                type="button"
                className="fe-admin-action fe-admin-action--edit"
                onClick={() => {
                  setOpenId(r.id)
                  setEditingId(editing ? null : r.id)
                }}
              >
                {editing ? '編集を閉じる' : '編集'}
              </button>
              <button type="button" className="fe-admin-action fe-admin-action--del" onClick={() => onDelete(r.id, r.artistName)}>
                削除
              </button>
            </div>

            {open && editing ? (
              <RegistrationEditForm
                key={`${r.id}-${r.updatedAt}`}
                initial={r}
                onSave={(fields) => onSaveEdit(r.id, fields)}
                onCancel={() => setEditingId(null)}
              />
            ) : null}

            {open && !editing ? (
              <dl className="fe-admin-detail">
                <div>
                  <dt>メール</dt>
                  <dd>{r.email || '—'}</dd>
                </div>
                <div>
                  <dt>代表者名</dt>
                  <dd>{r.realName || '—'}</dd>
                </div>
                <div>
                  <dt>電話</dt>
                  <dd>{r.phone || '—'}</dd>
                </div>
                <div>
                  <dt>活動拠点</dt>
                  <dd>{r.activityBase || '—'}</dd>
                </div>
                <div>
                  <dt>ジャンル</dt>
                  <dd>{r.genre || '—'}</dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>プロフィール</dt>
                  <dd>{r.profile || '—'}</dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>過去出演歴</dt>
                  <dd>{r.achievements || '—'}</dd>
                </div>
                <div>
                  <dt>SNS</dt>
                  <dd>
                    {r.snsUrl ? (
                      <a href={r.snsUrl} target="_blank" rel="noopener noreferrer">
                        {r.snsUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>公式サイト</dt>
                  <dd>
                    {r.website ? (
                      <a href={r.website} target="_blank" rel="noopener noreferrer">
                        {r.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>宣材写真URL</dt>
                  <dd>
                    {r.photoUrl ? (
                      <a href={r.photoUrl} target="_blank" rel="noopener noreferrer">
                        {r.photoUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>動画URL</dt>
                  <dd>
                    {r.videoUrl ? (
                      <a href={r.videoUrl} target="_blank" rel="noopener noreferrer">
                        {r.videoUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>サポートURL</dt>
                  <dd>
                    {r.tipUrl ? (
                      <a href={r.tipUrl} target="_blank" rel="noopener noreferrer">
                        {r.tipUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>出演希望日</dt>
                  <dd>{r.preferredDates || '—'}</dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>希望ステージ</dt>
                  <dd>{r.preferredStage || '—'}</dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>運営への連絡事項</dt>
                  <dd>{r.staffNote || '—'}</dd>
                </div>
                <div className="fe-admin-detail--full">
                  <dt>備考</dt>
                  <dd>{r.notes || '—'}</dd>
                </div>
                <div>
                  <dt>ID</dt>
                  <dd className="fe-admin-mono">{r.id}</dd>
                </div>
              </dl>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
