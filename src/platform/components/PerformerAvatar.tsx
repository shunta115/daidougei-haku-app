type Props = {
  url?: string | null
  name: string
  isLive?: boolean
  size?: number
  onClick?: () => void
}

export function PerformerAvatar({ url, name, isLive = false, size = 92, onClick }: Props) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`hp-avatar${isLive ? ' hp-avatar--live' : ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      onClick={onClick}
      aria-label={isLive ? `${name} LIVE` : name}
    >
      <span className="hp-avatar__ring" aria-hidden="true" />
      <span className="hp-avatar__media">
        {url ? (
          <img src={url} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <span className="hp-avatar__fallback">{initial}</span>
        )}
      </span>
      {isLive ? <em className="hp-avatar__live">LIVE</em> : null}
    </Tag>
  )
}
