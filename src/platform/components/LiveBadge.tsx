type Props = {
  label?: string
  className?: string
}

/** Shared “LIVE中” indicator for lists, search, profiles. */
export function LiveBadge({ label = 'LIVE中', className = '' }: Props) {
  return <span className={`pl-live-badge ${className}`.trim()}>{label}</span>
}
