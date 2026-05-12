import type { AppPersona } from '../types'

type TopBarProps = {
  persona: AppPersona
  /** 来場者モードのときのみ意味を持つ（将来: 通知バッジ等） */
  visitorContext?: string
  onExitPerformerOrAdmin: () => void
  /** 打ち上げ用：来場者ホームをプレゼン向けに簡略表示 */
  launchPartyDemo?: boolean
  onToggleLaunchPartyDemo?: () => void
}

/**
 * 将来: visitorContext を Auth の displayName に、退出ボタンをログアウトに差し替え。
 */
export function TopBar({
  persona,
  visitorContext,
  onExitPerformerOrAdmin,
  launchPartyDemo,
  onToggleLaunchPartyDemo,
}: TopBarProps) {
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
        {isVisitor && onToggleLaunchPartyDemo ? (
          <button
            type="button"
            className={`fe-staff-btn fe-staff-btn--party${launchPartyDemo ? ' fe-staff-btn--party-on' : ''}`}
            onClick={onToggleLaunchPartyDemo}
            aria-pressed={launchPartyDemo ?? false}
            title="出演者向け打ち上げ：ホームをプレゼン用に簡略表示"
          >
            {launchPartyDemo ? 'プレゼン ON' : '打ち上げプレゼン'}
          </button>
        ) : null}
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
