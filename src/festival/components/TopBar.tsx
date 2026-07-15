import type { AppPersona } from '../types'

type TopBarProps = {
  persona: AppPersona
  visitorContext?: string
  onExitPerformerOrAdmin: () => void
}

export function TopBar({ persona, visitorContext, onExitPerformerOrAdmin }: TopBarProps) {
  const isVisitor = persona === 'visitor'

  return (
    <header className="fe-topbar">
      <div className="fe-mark">
        <span className="fe-mark__glyph" aria-hidden="true">
          <span className="fe-mark__ring" />
        </span>
        <span className="fe-mark__text">
          <span className="fe-mark__eyebrow">Street Performance Expo</span>
          <span className="fe-mark__title">大道芸博</span>
        </span>
      </div>

      <div className="fe-topbar__actions">
        {!isVisitor ? (
          <button type="button" className="fe-staff-btn fe-staff-btn--exit" onClick={onExitPerformerOrAdmin}>
            来場者モードへ
          </button>
        ) : null}
        <div className="fe-live-pill" title={visitorContext ?? 'Guest mode'}>
          <span className="fe-live-pill__dot" aria-hidden="true" />
          <span className="fe-live-pill__label">
            {persona === 'visitor' ? 'GUEST' : persona === 'performer' ? 'ENTRY' : 'ADMIN'}
          </span>
        </div>
      </div>
    </header>
  )
}
