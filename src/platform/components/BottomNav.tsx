import { spaGo, FESTIVAL_PATH } from '../../app/routes'
import { useLang } from '../../i18n/LangProvider'

type BottomNavProps = {
  role: 'fan' | 'performer' | 'organizer' | 'admin'
  active: string
  onNavigate: (key: string) => void
}

export function BottomNav({ role, active, onNavigate }: BottomNavProps) {
  const { t } = useLang()
  const items =
    role === 'admin'
      ? [
          { key: 'event-home', label: t('eventHome'), href: FESTIVAL_PATH },
          { key: 'admin', label: 'Today' },
          { key: 'admin-event', label: 'Event' },
          { key: 'admin-users', label: 'Users' },
          { key: 'admin-ops', label: 'AI' },
        ]
      : role === 'performer'
        ? [
            { key: 'event-home', label: t('eventHome'), href: FESTIVAL_PATH },
            { key: 'performer-home', label: t('home') },
            { key: 'live-list', label: t('live') },
            { key: 'performer-live', label: t('goLive') },
            { key: 'performer-merch', label: 'Goods' },
            { key: 'notifications', label: t('notifications') },
          ]
        : role === 'organizer'
          ? [
              { key: 'event-home', label: t('eventHome'), href: FESTIVAL_PATH },
              { key: 'organizer-home', label: 'Desk' },
              { key: 'search', label: t('search') },
              { key: 'notifications', label: t('notifications') },
            ]
          : [
              { key: 'event-home', label: t('eventHome'), href: FESTIVAL_PATH },
              { key: 'fan-home', label: t('home') },
              { key: 'live-list', label: t('live') },
              { key: 'merch-list', label: 'Goods' },
              { key: 'search', label: t('search') },
              { key: 'notifications', label: t('notifications') },
              { key: 'profile', label: t('profile') },
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
              if ('href' in item && item.href) {
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
