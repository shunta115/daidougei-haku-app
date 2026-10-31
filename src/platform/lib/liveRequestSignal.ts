// AbortSignal.timeout is absent on older iPhone Safari versions.
export function liveRequestSignal(milliseconds = 8000): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), milliseconds)
  return controller.signal
}
