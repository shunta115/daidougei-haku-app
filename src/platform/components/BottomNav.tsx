import { CalendarDays, Compass, Home, MapPinned, Radio, Search, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FESTIVAL_PATH, spaGo } from '../../app/routes'
import { useLang } from '../../i18n/LangProvider'

type BottomNavProps = {
  role: 'fan' | 'performer' | 'organizer' | 'admin'
  active: string
  onNavigate: (key: string) => void
}

type NavItem = { key: string; label: string; href?: string; icon: LucideIcon }

export function BottomNav({ role, active, onNavigate }: BottomNavProps) {
  const { t } = useLang()
  const labels = {
    discover: t('navDiscover'),
    account: t('navMyPage'),
    map: t('navMap'),
    live: t('navLive'),
    event: t('eventHome'),
  }

  const publicItems: NavItem[] = [
    { key: 'fan-home', label: t('home'), icon: Home },
    { key: 'event-list', label: labels.event, icon: CalendarDays },
    { key: 'live-list', label: labels.live, icon: Radio },
    { key: 'map-schedule', label: labels.map, icon: MapPinned },
    { key: 'profile', label: labels.account, icon: User },
  ]

  const items: NavItem[] = role === 'admin'
    ? [
        { key: 'haku-admin', label: '新運営', href: '/haku-admin', icon: Compass },
        { key: 'event-home', label: labels.event, href: FESTIVAL_PATH, icon: CalendarDays },
        { key: 'admin', label: '登録確認', icon: User },
        { key: 'admin-event', label: '運営', icon: Compass },
        { key: 'admin-users', label: '利用者', icon: User },
        { key: 'admin-ops', label: '分析', icon: Compass },
      ]
    : role === 'organizer'
      ? [
          { key: 'event-home', label: labels.event, href: FESTIVAL_PATH, icon: CalendarDays },
          { key: 'organizer-home', label: 'Desk', icon: Home },
          { key: 'search', label: labels.discover, icon: Search },
          { key: 'notifications', label: t('notifications'), icon: User },
        ]
      : publicItems

  const hakuChrome = role === 'fan' || role === 'performer'

  return (
    <nav className={`pl-nav${hakuChrome ? ' pl-nav--fan' : ''}`} aria-label="Main">
      <div className="pl-nav__inner">
        {items.map((item) => {
          const Icon = item.icon
          const live = hakuChrome && item.key === 'live-list'
          return (
            <button
              key={item.key}
              type="button"
              className={`pl-nav__btn${live ? ' pl-nav__btn--live' : ''}`}
              data-active={active === item.key}
              onClick={() => {
                if (item.href) {
                  if (item.href === '/haku-admin') { window.location.assign('/haku-admin'); return }
                  spaGo(item.href); return
                }
                onNavigate(item.key)
              }}
            >
              <span className="pl-nav__icon"><Icon size={live ? 21 : 20} strokeWidth={live ? 2.2 : 1.8} /></span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
