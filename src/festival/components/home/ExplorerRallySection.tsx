import { useCallback, useState } from 'react'
import type { Performer } from '../../types'
import { getCatalogVenues } from '../../../catalog/liveCatalog'
import { readWatchlist, toggleWatchlist } from '../../lib/watchlistStorage'
import { readVisitedVenues, strollProgress, toggleVenueVisited } from '../../lib/venueStrollStorage'
import { readSoonNotifyOn, toggleSoonNotify } from '../../lib/soonNotifyStorage'

type ExplorerRallySectionProps = {
  performers: Performer[]
  onOpenPerformer: (id: string) => void
  onOpenMap: () => void
  onOpenOshi: () => void
  gameTick: number
}

export function ExplorerRallySection({
  performers,
  onOpenPerformer,
  onOpenMap,
  onOpenOshi,
  gameTick,
}: ExplorerRallySectionProps) {
  const [, setT] = useState(0)
  const bump = useCallback(() => setT((n) => n + 1), [])

  const watch = readWatchlist()
  const stroll = strollProgress(getCatalogVenues().length)
  const soonOn = readSoonNotifyOn()
  const visited = new Set(readVisitedVenues())
  const badge3 = stroll.visited >= 3
  const badgeAll = stroll.visited >= stroll.total && stroll.total > 0

  return (
    <section className="fe-xpl" aria-label="回遊 · ステージ巡り">
      <div className="fe-xpl__head">
        <h2 className="fe-xpl__title">
          <span className="fe-xpl__eyebrow" lang="en">
            ROAM
          </span>
          ステージ巡り
        </h2>
        <p className="fe-xpl__lead">チェックインで街がゲージに。バッジは端末に保存。</p>
      </div>

      <div className="fe-xpl__badges" data-tick={gameTick}>
        <div className={`fe-xpl__badge${badge3 ? ' fe-xpl__badge--on' : ''}`}>
          <span className="fe-xpl__badge-k">3 STAGES</span>
          <span className="fe-xpl__badge-v">{badge3 ? '達成' : '未達'}</span>
        </div>
        <div className={`fe-xpl__badge fe-xpl__badge--wide${badgeAll ? ' fe-xpl__badge--on' : ''}`}>
          <span className="fe-xpl__badge-k">FULL CLEAR</span>
          <span className="fe-xpl__badge-v">{badgeAll ? '全ステージ制覇' : `${stroll.visited}/${stroll.total}`}</span>
        </div>
      </div>

      <div className="fe-xpl__grid">
        <div className="fe-xpl__card">
          <p className="fe-xpl__k">推しリスト</p>
          <p className="fe-xpl__v">端末保存</p>
          <button type="button" className="fe-xpl__btn" onClick={onOpenOshi}>
            OPEN
          </button>
        </div>
        <div className="fe-xpl__card">
          <p className="fe-xpl__k">見たい</p>
          <p className="fe-xpl__v">{watch.length}</p>
          <p className="fe-xpl__hint">詳細からリストへ追加</p>
        </div>
        <div className="fe-xpl__card">
          <p className="fe-xpl__k">まもなく UI</p>
          <p className="fe-xpl__v">{soonOn ? 'ON' : 'OFF'}</p>
          <button
            type="button"
            className="fe-xpl__btn"
            onClick={() => {
              toggleSoonNotify()
              bump()
            }}
          >
            トグル
          </button>
        </div>
      </div>

      <div className="fe-xpl__banner" data-tick={gameTick}>
        <div>
          <p className="fe-xpl__k">CHECK-IN</p>
          <p className="fe-xpl__sub">
            {stroll.visited} / {stroll.total} ステージ
          </p>
        </div>
        <button type="button" className="fe-xpl__btn" onClick={onOpenMap}>
          MAP
        </button>
      </div>

      <div className="fe-xpl__venues">
        {getCatalogVenues().map((v) => (
          <button
            key={v.id}
            type="button"
            className={`fe-xpl__venue${visited.has(v.id) ? ' fe-xpl__venue--on' : ''}`}
            onClick={() => {
              toggleVenueVisited(v.id)
              bump()
            }}
          >
            <span className="fe-xpl__venue-n">{v.nameJa}</span>
            <span className="fe-xpl__venue-s">{visited.has(v.id) ? 'CHECKED' : 'TAP'}</span>
          </button>
        ))}
      </div>

      {performers[0] ? (
        <p className="fe-xpl__hint fe-xpl__hint--center">
          <button type="button" className="fe-xpl__link" onClick={() => onOpenPerformer(performers[0]!.id)}>
            {performers[0]!.nameJa}
          </button>
          の見たいを
          <button
            type="button"
            className="fe-xpl__link"
            onClick={() => {
              toggleWatchlist(performers[0]!.id)
              bump()
            }}
          >
            トグル
          </button>
        </p>
      ) : null}
    </section>
  )
}
