import { useEffect, useRef, useState } from 'react'

type Options = {
  rootMargin?: string
  threshold?: number
  once?: boolean
}

export function useReveal<T extends HTMLElement>(options?: Options) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const once = options?.once ?? true
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (!hit) return
        setVisible(true)
        if (once) io.disconnect()
      },
      {
        rootMargin: options?.rootMargin ?? '0px 0px -10% 0px',
        threshold: options?.threshold ?? 0.08,
      },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [options?.once, options?.rootMargin, options?.threshold])

  return { ref, visible }
}
