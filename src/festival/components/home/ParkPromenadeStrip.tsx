import type { VisitorTab } from '../../types'

type ParkPromenadeStripProps = {
  onTab: (t: VisitorTab) => void
  onScrollGuide: () => void
  onScrollTips: () => void
}

export function ParkPromenadeStrip({ onTab, onScrollGuide, onScrollTips }: ParkPromenadeStripProps) {
  return (
    <section className="fe-promenade" aria-label="クイック導線">
      <div className="fe-promenade__inner">
        <span className="fe-promenade__tag">NEXT</span>
        <button type="button" className="fe-promenade__btn" onClick={() => onTab('timetable')}>
          タイムテーブル
        </button>
        <span className="fe-promenade__dot" aria-hidden="true" />
        <span className="fe-promenade__tag fe-promenade__tag--live">LIVE</span>
        <button type="button" className="fe-promenade__btn" onClick={() => onTab('map')}>
          会場マップ
        </button>
        <span className="fe-promenade__dot" aria-hidden="true" />
        <button type="button" className="fe-promenade__btn fe-promenade__btn--tip" onClick={onScrollTips}>
          投げ銭
        </button>
        <span className="fe-promenade__dot" aria-hidden="true" />
        <button type="button" className="fe-promenade__btn" onClick={() => onTab('library')}>
          お気に入り
        </button>
        <span className="fe-promenade__dot" aria-hidden="true" />
        <button type="button" className="fe-promenade__btn fe-promenade__btn--ghost" onClick={onScrollGuide}>
          楽しみ方
        </button>
      </div>
    </section>
  )
}
