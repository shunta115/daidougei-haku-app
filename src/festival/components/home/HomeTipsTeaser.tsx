import { readFavorites } from '../../lib/favoritesStorage'
import { canWatchLiveStream } from '../../lib/productionGuard'
import type { Performer } from '../../types'

type HomeTipsTeaserProps = {
  liveStreamers: readonly Performer[]
  onOpenOshi: () => void
  onWatchOshiLive?: (performerId: string) => void
}

/** ホーム上の推し・応援導線。推しがLIVEなら最優先で案内。 */
export function HomeTipsTeaser({ liveStreamers, onOpenOshi, onWatchOshiLive }: HomeTipsTeaserProps) {
  const favIds = readFavorites()
  const liveOshi = liveStreamers.filter((p) => favIds.includes(p.id))
  const watchTarget = liveOshi.find((p) => canWatchLiveStream(p)) ?? liveOshi[0]
  const watchable = watchTarget ? canWatchLiveStream(watchTarget) : false

  return (
    <section className="fe-home-tips" id="fe-home-tips" aria-labelledby="fe-home-tips-h">
      <div className="fe-home-tips__glow" aria-hidden="true" />
      <div className="fe-home-tips__inner">
        {liveOshi.length > 0 ? (
          <>
            <p className="fe-home-tips__eyebrow fe-home-tips__eyebrow--live" lang="en">
              OSHI LIVE
            </p>
            <h2 id="fe-home-tips-h" className="fe-home-tips__title">
              推しがいま配信中
            </h2>
            <p className="fe-home-tips__text">
              {liveOshi.map((p) => p.nameJa).join(' / ')} — 視聴は無料 · 応援はWEBで完結。
            </p>
            <div className="fe-home-tips__actions">
              {onWatchOshiLive && watchTarget ? (
                <button
                  type="button"
                  className="fe-btn fe-btn--primary"
                  disabled={!watchable}
                  onClick={() => watchable && onWatchOshiLive(watchTarget.id)}
                >
                  {watchable ? '今すぐ見る' : '配信準備中'}
                </button>
              ) : null}
              <button type="button" className="fe-btn fe-btn--glass" onClick={onOpenOshi}>
                推しリスト
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="fe-home-tips__eyebrow" lang="en">
              SUPPORT
            </p>
            <h2 id="fe-home-tips-h" className="fe-home-tips__title">
              推しを、すぐ応援できる場所へ
            </h2>
            <p className="fe-home-tips__text">
              推しリストに保存すると、LIVE時にここに案内が出ます。投げ銭はWEB完結です。
            </p>
            <div className="fe-home-tips__actions">
              <button type="button" className="fe-btn fe-btn--primary" onClick={onOpenOshi}>
                推しリスト
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
