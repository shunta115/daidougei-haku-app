import { useReveal } from '../hooks/useReveal'

type RevealProps = {
  children: React.ReactNode
  className?: string
}

export function Reveal({ children, className }: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`fe-reveal${visible ? ' fe-reveal--in' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}
