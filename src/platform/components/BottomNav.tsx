type BottomNavProps = {
  role: 'fan' | 'performer' | 'admin'
  active: string
  onNavigate: (key: string) => void
}

export function BottomNav({ role, active, onNavigate }: BottomNavProps) {
  const items =
    role === 'admin'
      ? [
          { key: 'admin', label: 'Dashboard' },
          { key: 'admin-users', label: 'Users' },
          { key: 'search', label: 'Search' },
        ]
      : role === 'performer'
        ? [
            { key: 'performer-home', label: 'Home' },
            { key: 'performer-live', label: 'Live' },
            { key: 'performer-edit', label: 'Profile' },
            { key: 'notifications', label: 'Alerts' },
          ]
        : [
            { key: 'fan-home', label: 'Live' },
            { key: 'search', label: 'Search' },
            { key: 'notifications', label: 'Alerts' },
            { key: 'profile', label: 'You' },
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
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
