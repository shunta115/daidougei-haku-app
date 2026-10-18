import { ArrowLeft } from 'lucide-react'

type Props = {
  onClick: () => void
  label: string
  className?: string
  iconOnly?: boolean
}

export function AppBackButton({ onClick, label, className = '', iconOnly = false }: Props) {
  return (
    <button
      type="button"
      className={`pl-back-button${iconOnly ? ' pl-back-button--icon' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
    >
      <ArrowLeft size={iconOnly ? 20 : 18} aria-hidden="true" />
      {iconOnly ? null : <span>{label}</span>}
    </button>
  )
}
