import type { VisitorTab } from '../../types'

type VisitorQuickSheetProps = {
  open: boolean
  onClose: () => void
  onTab: (t: VisitorTab) => void
}

export function VisitorQuickSheet({ open, onClose, onTab }: VisitorQuickSheetProps) {
  if (!open) return null
  return (
    <div className="fe-qsheet" role="dialog" aria-modal="true" aria-label="クイックメニュー">
      <button type="button" className="fe-qsheet__scrim" onClick={onClose} aria-label="閉じる" />
      <div className="fe-qsheet__panel">
        <div className="fe-qsheet__grab" aria-hidden="true" />
        <p className="fe-qsheet__title">クイック移動</p>
        <div className="fe-qsheet__grid">
          <button type="button" className="fe-qsheet__btn" onClick={() => { onTab('timetable'); onClose() }}>
            タイムテーブル
          </button>
          <button type="button" className="fe-qsheet__btn" onClick={() => { onTab('map'); onClose() }}>
            会場マップ
          </button>
          <button type="button" className="fe-qsheet__btn fe-qsheet__btn--gold" onClick={() => { onTab('tips'); onClose() }}>
            投げ銭
          </button>
          <button type="button" className="fe-qsheet__btn" onClick={() => { onTab('library'); onClose() }}>
            お気に入り
          </button>
          <button type="button" className="fe-qsheet__btn" onClick={() => { onTab('performers'); onClose() }}>
            アーティスト
          </button>
          <button type="button" className="fe-qsheet__btn" onClick={() => { onTab('home'); onClose() }}>
            ホーム
          </button>
        </div>
      </div>
    </div>
  )
}

type VisitorFabProps = {
  onOpen: () => void
}

export function VisitorFab({ onOpen }: VisitorFabProps) {
  return (
    <button type="button" className="fe-fab" onClick={onOpen} aria-label="クイックメニューを開く">
      <span className="fe-fab__ring" aria-hidden="true" />
      <span className="fe-fab__plus">+</span>
    </button>
  )
}
