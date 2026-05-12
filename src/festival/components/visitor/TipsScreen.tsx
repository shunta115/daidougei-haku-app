import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { bumpXp } from '../../lib/gamificationStorage'

type TipsScreenProps = {
  performers: Performer[]
  onOpenPerformer: (id: string) => void
  onXpBump: () => void
}

export function TipsScreen({ performers, onOpenPerformer, onXpBump }: TipsScreenProps) {
  return (
    <main className="fe-main fe-main--sub fe-main--tips">
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow">Support</p>
        <h1 className="fe-page-head__title">応援 · 投げ銭</h1>
        <p className="fe-page-head__lead">外部リンク方式。タップで決済サービスへ（デモURL）。</p>
      </header>

      <ul className="fe-tips-list">
        {performers.map((p) => {
          const tips = p.tipLinks ?? []
          const first = tips[0]
          return (
            <li key={p.id} className="fe-tips-card">
              <button type="button" className="fe-tips-card__head" onClick={() => onOpenPerformer(p.id)}>
                <span
                  className={`fe-tips-card__av${p.photoUrl ? ' fe-tips-card__av--photo' : ''}`}
                  style={
                    p.photoUrl
                      ? { backgroundImage: `url(${p.photoUrl})` }
                      : { background: p.gradient }
                  }
                >
                  {!p.photoUrl ? initials(p.name) : null}
                </span>
                <span className="fe-tips-card__who">
                  <span className="fe-tips-card__name">{p.nameJa}</span>
                  <span className="fe-tips-card__act">{p.actJa}</span>
                </span>
                <span className="fe-tips-card__chev">›</span>
              </button>
              <div className="fe-tips-card__actions">
                {first ? (
                  <a
                    className="fe-btn fe-btn--primary fe-tips-card__support"
                    href={first.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      bumpXp(6)
                      onXpBump()
                    }}
                  >
                    応援する
                  </a>
                ) : null}
                {tips.map((t) => (
                  <a
                    key={t.id}
                    className="fe-tips-link"
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      bumpXp(2)
                      onXpBump()
                    }}
                  >
                    {t.labelJa}
                  </a>
                ))}
                {p.snsList?.[0] ? (
                  <a className="fe-tips-link fe-tips-link--ghost" href={p.snsList[0].url} target="_blank" rel="noopener noreferrer">
                    SNS
                  </a>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
