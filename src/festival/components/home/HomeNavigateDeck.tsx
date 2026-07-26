import type { VisitorTab } from '../../types'

type HomeNavigateDeckProps = {
  onTab: (t: VisitorTab) => void
  onScrollTips: () => void
}

/**
 * ホーム上段の大型導線 — マップ / タイムテーブル / 応援・サポート
 */
export function HomeNavigateDeck({ onTab, onScrollTips }: HomeNavigateDeckProps) {
  return (
    <section className="fe-home-deck" aria-label="主要導線">
      <div className="fe-home-deck__grid">
        <button type="button" className="fe-home-deck__card fe-home-deck__card--map" onClick={() => onTab('map')}>
          <span className="fe-home-deck__glow" aria-hidden="true" />
          <span className="fe-home-deck__label">会場マップ</span>
          <span className="fe-home-deck__sub">エリア × 演目 · LIVE</span>
        </button>
        <button type="button" className="fe-home-deck__card fe-home-deck__card--tt" onClick={() => onTab('timetable')}>
          <span className="fe-home-deck__glow" aria-hidden="true" />
          <span className="fe-home-deck__label">タイムテーブル</span>
          <span className="fe-home-deck__sub">日付 / 会場 / 出演者</span>
        </button>
        <button type="button" className="fe-home-deck__card fe-home-deck__card--support" onClick={onScrollTips}>
          <span className="fe-home-deck__glow" aria-hidden="true" />
          <span className="fe-home-deck__label">応援する</span>
          <span className="fe-home-deck__sub">エール · サポーター導線</span>
        </button>
      </div>
    </section>
  )
}
