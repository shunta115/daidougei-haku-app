import { useCallback, useState } from 'react'
import { readRegistrations } from '../lib/registrationsStorage'
import type { PerformerRegistration } from '../types'

type MyRegistrationsListScreenProps = {
  onBack: () => void
  onNewRegistration: () => void
}

function formatJaDate(iso: string) {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
  } catch {
    return iso
  }
}

export function MyRegistrationsListScreen({ onBack, onNewRegistration }: MyRegistrationsListScreenProps) {
  const [rows, setRows] = useState<PerformerRegistration[]>(() => readRegistrations())

  const refresh = useCallback(() => setRows(readRegistrations()), [])

  return (
    <main className="fe-main fe-main--reg-list">
      <header className="fe-page-head">
        <button type="button" className="fe-page-head__back" onClick={onBack}>
          ← 戻る
        </button>
        <p className="fe-page-head__eyebrow" lang="en">
          My applications
        </p>
        <h1 className="fe-page-head__title">登録一覧</h1>
        <p className="fe-page-head__lead">この端末の localStorage に保存された申請です。本番ではアカウントと同期します。</p>
      </header>

      <div className="fe-reg-list-actions">
        <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onNewRegistration}>
          新規登録を送る
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={refresh}>
          一覧を再読込
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="fe-reg-list-empty">
          <p>まだ申請がありません。</p>
          <p className="fe-reg-list-empty__hint">「新規登録を送る」からフォームを開けます。</p>
        </div>
      ) : (
        <ul className="fe-reg-list">
          {rows.map((r) => (
            <li key={r.id} className="fe-reg-list-card">
              <div className="fe-reg-list-card__top">
                <h2 className="fe-reg-list-card__name">{r.artistName || '（無題）'}</h2>
                <span className="fe-reg-list-card__date">{formatJaDate(r.createdAt)}</span>
              </div>
              <p className="fe-reg-list-card__genre">
                {r.genre || '—'}
                {r.activityBase ? ` · ${r.activityBase}` : ''}
              </p>
              <dl className="fe-reg-list-card__dl">
                <div className="fe-reg-list-card__dl--full">
                  <dt>プロフィール</dt>
                  <dd>{r.profile || '—'}</dd>
                </div>
                <div className="fe-reg-list-card__dl--full">
                  <dt>過去出演歴</dt>
                  <dd>{r.achievements || '—'}</dd>
                </div>
                <div>
                  <dt>出演希望日</dt>
                  <dd>{r.preferredDates || '—'}</dd>
                </div>
                <div>
                  <dt>希望ステージ</dt>
                  <dd>{r.preferredStage || '—'}</dd>
                </div>
                <div className="fe-reg-list-card__dl--full">
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
                <div className="fe-reg-list-card__dl--full">
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
                <div className="fe-reg-list-card__dl--full">
                  <dt>運営への連絡事項</dt>
                  <dd>{r.staffNote || '—'}</dd>
                </div>
                <div className="fe-reg-list-card__dl--full">
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
                <div className="fe-reg-list-card__dl--full">
                  <dt>写真URL</dt>
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
                {r.notes ? (
                  <div className="fe-reg-list-card__dl--full">
                    <dt>備考</dt>
                    <dd>{r.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
