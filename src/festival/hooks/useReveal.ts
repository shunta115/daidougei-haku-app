import { useEffect, useRef, useState } from 'react'

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (!hit) return
        setVisible(true)
        io.disconnect()
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [])

  return { ref, visible }
}
