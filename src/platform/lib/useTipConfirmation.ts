import { useEffect, useState } from 'react'
import { trackProductEvent } from './track'

const PENDING_KEY = 'pl-tip-confirm'
const completed = new Set<string>()
function readStorage(key: string) {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}
function saveStorage(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch { /* Verification still works when browser storage is unavailable. */ }
}

type Result = {
  message: 'tipConfirming' | 'tipSuccess' | 'tipUnconfirmed' | 'tipConfirmationPending' | 'tipConfirmationError' | null
  performerId: string | null
}

export function useTipConfirmation() {
  const [sessionId] = useState(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tip') === 'success') return url.searchParams.get('session_id') ?? ''
    if (url.searchParams.has('tip')) { saveStorage(PENDING_KEY, null); return null }
    return readStorage(PENDING_KEY)
  })
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({ message: null, performerId: null })

  useEffect(() => {
    if (sessionId === null) return
    if (!/^cs_(test|live)_[a-zA-Z0-9]{16,200}$/.test(sessionId)) {
      saveStorage(PENDING_KEY, null)
      setResult({ message: 'tipUnconfirmed', performerId: null })
      return
    }
    saveStorage(PENDING_KEY, sessionId)
    setResult({ message: 'tipConfirming', performerId: null })
    let active = true
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const check = async (poll: number) => {
      controller = new AbortController()
      timeout = setTimeout(() => controller?.abort(), 8000)
      try {
        const response = await fetch('/api/stripe/confirm', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Confirmation unavailable')
        const body = await response.json() as { ok?: boolean; status?: string; performerId?: string }
        if (!active) return
        if (body.ok === true && body.status === 'paid' && typeof body.performerId === 'string' && body.performerId) {
          saveStorage(PENDING_KEY, null)
          setResult({ message: 'tipSuccess', performerId: body.performerId })
          const key = `pl-tip-complete:${sessionId}`
          if (!completed.has(sessionId) && !readStorage(key)) {
            completed.add(sessionId)
            saveStorage(key, '1')
            // Never use performerId from the return URL or send the bearer ID to analytics.
            trackProductEvent('tip_complete', { performerId: body.performerId })
          }
        } else if (body.ok === false && body.status === 'pending') {
          if (poll < 5) pollTimer = setTimeout(() => void check(poll + 1), 2000)
          else setResult({ message: 'tipConfirmationPending', performerId: null })
        } else if (body.ok === false && body.status === 'unconfirmed') {
          saveStorage(PENDING_KEY, null)
          setResult({ message: 'tipUnconfirmed', performerId: null })
        } else throw new Error('Invalid confirmation response')
      } catch {
        if (active) setResult({ message: 'tipConfirmationError', performerId: null })
      } finally { clearTimeout(timeout) }
    }
    void check(0)
    return () => {
      active = false
      clearTimeout(pollTimer)
      clearTimeout(timeout)
      controller?.abort()
    }
  }, [sessionId, attempt])

  return {
    ...result,
    canRetry: result.message === 'tipConfirmationPending' || result.message === 'tipConfirmationError',
    retry: () => setAttempt(value => value + 1),
  }
}
