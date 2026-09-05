import { spaGo, PLATFORM_PATH } from '../../../app/routes'
import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { bumpXp } from '../../lib/gamificationStorage'
import { canProcessOnlineSupport, canWatchLiveStream } from '../../lib/productionGuard'
import { shouldShowAsLiveStream } from '../../lib/streamPresence'

type TipsScreenProps = {
  performers: Performer[]
  onOpenPerformer: (id: string) => void
  onXpBump: () => void
  onWatchStream?: (id: string) => void
  onSupportStream?: (id: string) => void
  onBetaSupport?: () => void
}

function isLiveNow(p: Performer) {
  return shouldShowAsLiveStream(p)
}

export function TipsScreen({
  performers,
  onOpenPerformer,
  onXpBump,
  onWatchStream,
  onSupportStream,
  onBetaSupport,
}: TipsScreenProps) {
  const ordered = [...performers].sort((a, b) => {
    const rank = (p: Performer) => (isLiveNow(p) ? 0 : p.approvalStatus === 'approved' && p.canStream ? 1 : 2)
    return rank(a) - rank(b) || b.heat - a.heat
  })

  const handleSupport = (id: string) => {
    if (!canProcessOnlineSupport()) {
      onBetaSupport?.()
      return
    }
    bumpXp(6)
    onXpBump()
    onSupportStream?.(id)
  }

  return (
    <main className="fe-main fe-main--sub fe-main--tips">
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow" lang="en">
          WEB TIP · SUPPORT
        </p>
        <h1 className="fe-page-head__title">応援 &amp; WEB投げ銭</h1>
        <p className="fe-page-head__lead">
          {canProcessOnlineSupport()
            ? 'お支払いは外部の安全なページで完結。アプリ内課金はありません。合計金額も表示しません。'
            : 'ライブ配信と投げ銭はログインして利用できます。'}
        </p>
      </header>

      {!canProcessOnlineSupport() ? (
        <p className="fe-public-prep" role="status">
          <button type="button" className="fe-h6-maprow__primary" onClick={() => spaGo(PLATFORM_PATH)}>
            配信・投げ銭を開く
          </button>
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <p className="fe-public-prep" role="status">
          出演情報は順次公開します。
        </p>
      ) : null}

      <ul className="fe-tips-list">
        {ordered.map((p) => {
          const live = isLiveNow(p)
          const watchable = canWatchLiveStream(p)
          return (
            <li key={p.id} className={`fe-tips-card${live ? ' fe-tips-card--live' : ''}`}>
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
                  <span className="fe-tips-card__name">
                    {p.nameJa}
                    {live ? (
                      <span className="fe-tips-card__live" lang="en">
                        LIVE
                      </span>
                    ) : null}
                  </span>
                  <span className="fe-tips-card__act">
                    {p.country ? `${p.country} · ` : ''}
                    {p.genre ?? p.actJa}
                  </span>
                </span>
                <span className="fe-tips-card__chev">›</span>
              </button>
              <div className="fe-tips-card__actions">
                {live && onWatchStream ? (
                  <button
                    type="button"
                    className="fe-btn fe-btn--primary fe-tips-card__support"
                    disabled={!watchable}
                    onClick={() => watchable && onWatchStream(p.id)}
                  >
                    {watchable ? '視聴する' : '配信準備中'}
                  </button>
                ) : null}
                {live && onSupportStream ? (
                  <button
                    type="button"
                    className="fe-btn fe-btn--glass fe-tips-card__support fe-btn--support-primary"
                    onClick={() => handleSupport(p.id)}
                  >
                    WEBで応援
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fe-btn fe-btn--glass fe-tips-card__support fe-btn--support-primary"
                    onClick={() => handleSupport(p.id)}
                  >
                    WEB投げ銭
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
