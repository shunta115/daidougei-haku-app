type AvatarProps = {
  url?: string | null
  name: string
  large?: boolean
}

export function Avatar({ url, name, large }: AvatarProps) {
  if (url) {
    return (
      <img
        className={`pl-avatar${large ? ' pl-avatar--lg' : ''}`}
        src={url}
        alt=""
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  const initial = (name.trim()[0] || '?').toUpperCase()
  return (
    <div
      className={`pl-avatar${large ? ' pl-avatar--lg' : ''}`}
      style={{ display: 'grid', placeItems: 'center', fontWeight: 700 }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
