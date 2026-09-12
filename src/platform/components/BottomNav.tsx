import { FESTIVAL_PATH, spaGo } from '../../app/routes'
import { useLang } from '../../i18n/LangProvider'

type BottomNavProps = {
  role: 'fan' | 'performer' | 'organizer' | 'admin'
  active: string
  onNavigate: (key: string) => void
}

type NavItem = {
  key: string
  label: string
  href?: string
}

export function BottomNav({ role, active, onNavigate }: BottomNavProps) {
  const { lang, t } = useLang()
  const labels = {
    discover: lang === 'ja' ? '発見' : 'Discover',
    goods: lang === 'ja' ? 'グッズ' : 'Goods',
    you: lang === 'ja' ? 'マイ' : 'You',
    event: t('eventHome'),
  }

  const items: NavItem[] =
    role === 'admin'
      ? [
          { key: 'event-home', label: labels.event, href: FESTIVAL_PATH },
          { key: 'admin', label: 'Today' },
          { key: 'admin-event', label: 'Event' },
          { key: 'admin-users', label: 'Users' },
          { key: 'admin-ops', label: 'AI' },
        ]
      : role === 'performer'
        ? [
            { key: 'performer-home', label: t('home') },
            { key: 'search', label: labels.discover },
            { key: 'event-home', label: labels.event, href: FESTIVAL_PATH },
            { key: 'performer-live', label: t('live') },
            { key: 'performer-merch', label: labels.goods },
            { key: 'notifications', label: t('notifications') },
          ]
        : role === 'organizer'
          ? [
              { key: 'event-home', label: labels.event, href: FESTIVAL_PATH },
              { key: 'organizer-home', label: 'Desk' },
              { key: 'search', label: labels.discover },
              { key: 'notifications', label: t('notifications') },
            ]
          : [
              { key: 'fan-home', label: t('home') },
              { key: 'search', label: labels.discover },
              { key: 'live-list', label: t('live') },
              { key: 'event-home', label: labels.event, href: FESTIVAL_PATH },
              { key: 'merch-list', label: labels.goods },
              { key: 'profile', label: labels.you },
            ]

  return (
    <nav className="pl-nav" aria-label="Main">
      <div className="pl-nav__inner">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="pl-nav__btn"
            data-active={active === item.key}
            onClick={() => {
              if (item.href) {
                spaGo(item.href)
                return
              }
              onNavigate(item.key)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
