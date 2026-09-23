type BrandLogoProps = {
  size?: number
  className?: string
  variant?: 'mark' | 'lockup'
}

/** Official logo slots. Replace /logo.svg and /logo-mark.svg without changing app code. */
export function BrandLogo({ size = 28, className, variant = 'mark' }: BrandLogoProps) {
  const lockup = variant === 'lockup'
  return (
    <img
      className={className}
      src={lockup ? '/logo.svg' : '/logo-mark.svg'}
      width={lockup ? Math.round(size * 3.45) : size}
      height={size}
      alt=""
      onError={(e) => {
        const el = e.currentTarget
        if (el.dataset.fallback === '1') return
        el.dataset.fallback = '1'
        el.src = lockup ? '/logo-mark.svg' : '/favicon.svg'
      }}
    />
  )
}
