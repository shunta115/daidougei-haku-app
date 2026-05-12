import type { ReactNode } from 'react'
import type { VisitorTab } from '../../types'

type VisitorBottomNavProps = {
  tab: VisitorTab
  onChange: (t: VisitorTab) => void
}

export function VisitorBottomNav({ tab, onChange }: VisitorBottomNavProps) {
  return (
    <nav className="fe-vnav" aria-label="来場者ナビ">
      <div className="fe-vnav__inner fe-vnav__inner--six">
        <NavBtn active={tab === 'home'} onClick={() => onChange('home')} label="Home" aria="ホーム">
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={tab === 'performers'} onClick={() => onChange('performers')} label="Acts" aria="パフォーマー">
          <>
            <path
              d="M12 3c4.5 4.2 7 8.05 7 11.25A7 7 0 1 1 5 14.25C5 11.05 7.5 7.2 12 3Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" stroke="currentColor" strokeWidth="1.6" />
          </>
        </NavBtn>
        <NavBtn active={tab === 'timetable'} onClick={() => onChange('timetable')} label="Time" aria="タイムテーブル">
          <path
            d="M8 2v4M16 2v4M4 10h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={tab === 'map'} onClick={() => onChange('map')} label="Map" aria="会場マップ">
          <path
            d="M9 3 3 6v15l6-3 6 3 6-3V6l-6-3-6 3-6-3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={tab === 'tips'} onClick={() => onChange('tips')} label="Tip" aria="応援・投げ銭">
          <path
            d="M12 2v20M8 8h8M8 14h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={tab === 'library'} onClick={() => onChange('library')} label="Save" aria="お気に入り">
          <path
            d="M12 21s-7-4.35-7-10a7 7 0 1 1 14 0c0 5.65-7 10-7 10Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
      </div>
    </nav>
  )
}

function NavBtn({
  active,
  onClick,
  label,
  aria,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  aria: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="fe-vnav__btn"
      data-active={active}
      onClick={onClick}
      aria-label={aria}
      aria-current={active ? 'page' : undefined}
    >
      <span className="fe-vnav__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          {children}
        </svg>
      </span>
      <span className="fe-vnav__label">{label}</span>
    </button>
  )
}
