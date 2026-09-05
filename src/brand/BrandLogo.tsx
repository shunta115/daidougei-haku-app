type BrandLogoProps = {
  size?: number
  className?: string
}

/** Official logo slot. Drop a file at /logo.svg to replace the default mark. */
export function BrandLogo({ size = 28, className }: BrandLogoProps) {
  return (
    <img
      className={className}
      src="/logo.svg"
      width={size}
      height={size}
      alt=""
      onError={(e) => {
        const el = e.currentTarget
        if (el.dataset.fallback === '1') return
        el.dataset.fallback = '1'
        el.src = '/favicon.svg'
      }}
    />
  )
}
