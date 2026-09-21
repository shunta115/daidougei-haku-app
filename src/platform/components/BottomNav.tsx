import { CalendarDays, Compass, Home, Map, Radio, Search, ShoppingBag, User, Video } from 'lucide-react'
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
  const { lang, t } = useLang()
  const labels = {
    discover: lang === 'ja' ? '探す' : 'Discover',
    goods: lang === 'ja' ? 'グッズ' : 'Goods',
    account: lang === 'ja' ? 'マイ' : 'Me',
    map: 'MAP',
    event: t('eventHome'),
  }

  const items: NavItem[] = role === 'admin'
    ? [
        { key: 'event-home', label: labels.event, href: FESTIVAL_PATH, icon: CalendarDays },
        { key: 'admin', label: '登録確認', icon: User },
        { key: 'admin-event', label: '運営', icon: Compass },
        { key: 'admin-users', label: '利用者', icon: User },
        { key: 'admin-ops', label: '分析', icon: Compass },
      ]
    : role === 'performer'
      ? [
          { key: 'performer-home', label: t('home'), icon: Home },
          { key: 'event-home', label: labels.event, href: FESTIVAL_PATH, icon: CalendarDays },
          { key: 'performer-live', label: t('live'), icon: Video },
          { key: 'performer-merch', label: labels.goods, icon: ShoppingBag },
        ]
      : role === 'organizer'
        ? [
            { key: 'event-home', label: labels.event, href: FESTIVAL_PATH, icon: CalendarDays },
            { key: 'organizer-home', label: 'Desk', icon: Home },
            { key: 'search', label: labels.discover, icon: Search },
            { key: 'notifications', label: t('notifications'), icon: User },
          ]
        : [
            { key: 'fan-home', label: t('home'), icon: Home },
            { key: 'search', label: labels.discover, icon: Search },
            { key: 'live-list', label: 'LIVE', icon: Radio },
            { key: 'map-schedule', label: labels.map, icon: Map },
            { key: 'profile', label: labels.account, icon: User },
          ]

  return (
    <nav className={`pl-nav${role === 'fan' ? ' pl-nav--fan' : ''}`} aria-label="Main">
      <div className="pl-nav__inner">
        {items.map((item) => {
          const Icon = item.icon
          const live = role === 'fan' && item.key === 'live-list'
          return (
            <button
              key={item.key}
              type="button"
              className={`pl-nav__btn${live ? ' pl-nav__btn--live' : ''}`}
              data-active={active === item.key}
              onClick={() => {
                if (item.href) { spaGo(item.href); return }
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
