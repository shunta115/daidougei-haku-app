import type { ReactNode } from 'react'
import { useLang } from '../../../i18n/LangProvider'
import type { VisitorTab } from '../../types'

type VisitorBottomNavProps = {
  tab: VisitorTab
  onChange: (t: VisitorTab) => void
  onLive: () => void
  onGoods: () => void
  onAccount: () => void
}

export function VisitorBottomNav({ tab, onChange, onLive, onGoods, onAccount }: VisitorBottomNavProps) {
  const { lang, t } = useLang()
  const labels = {
    home: t('home'),
    discover: lang === 'ja' ? '発見' : 'Discover',
    live: t('live'),
    event: t('eventHome'),
    goods: lang === 'ja' ? 'グッズ' : 'Goods',
    account: lang === 'ja' ? 'マイ' : 'You',
  }

  return (
    <nav className="fe-vnav" aria-label="来場者ナビ">
      <div className="fe-vnav__inner fe-vnav__inner--six">
        <NavBtn active={tab === 'home'} onClick={() => onChange('home')} label={labels.home} aria={labels.home}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={tab === 'performers'} onClick={() => onChange('performers')} label={labels.discover} aria={labels.discover}>
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
        <NavBtn active={false} onClick={onLive} label={labels.live} aria={labels.live}>
          <>
            <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 9.2 16 12l-6 2.8V9.2Z" fill="currentColor" />
          </>
        </NavBtn>
        <NavBtn active={tab === 'timetable' || tab === 'map'} onClick={() => onChange('timetable')} label={labels.event} aria={labels.event}>
          <path
            d="M8 2v4M16 2v4M4 10h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={false} onClick={onGoods} label={labels.goods} aria={labels.goods}>
          <path
            d="M6.5 8.5h11l-1 11h-9l-1-11ZM9 8.5C9 5.9 10.3 4 12 4s3 1.9 3 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </NavBtn>
        <NavBtn active={false} onClick={onAccount} label={labels.account} aria={t('account')}>
          <>
            <circle cx="12" cy="8.2" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5.5 19.2c.7-3 3.2-4.8 6.5-4.8s5.8 1.8 6.5 4.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
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
