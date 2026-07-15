const KEY = 'daidougei-haku-soon-notify-v1'

export function readSoonNotifyOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeSoonNotifyOn(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0')
}

export function toggleSoonNotify(): boolean {
  const next = !readSoonNotifyOn()
  writeSoonNotifyOn(next)
  return next
}
