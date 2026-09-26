type BrandLogoProps = {
  size?: number
  className?: string
  variant?: 'mark' | 'lockup' | 'official'
}

/** Official logo slots. Replace /logo.svg and /logo-mark.svg without changing app code. */
export function BrandLogo({ size = 28, className, variant = 'mark' }: BrandLogoProps) {
  const lockup = variant === 'lockup'
  const official = variant === 'official'
  return (
    <img
      className={className}
      src={official ? '/brand/haku-official.jpg' : lockup ? '/logo.svg' : '/logo-mark.svg'}
      width={official ? size : lockup ? Math.round(size * 3.45) : size}
      height={size}
      alt={official ? '大道芸博 HAKU' : ''}
      onError={(e) => {
        const el = e.currentTarget
        if (el.dataset.fallback === '1') return
        el.dataset.fallback = '1'
        el.src = lockup || official ? '/logo-mark.svg' : '/favicon.svg'
      }}
    />
  )
}
