/** SECRET SHOW の「通知を受け取る」モック — 端末ローカル */
const KEY = 'daidougei-haku-secret-notify-v1'

export function readSecretNotifyOptIn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeSecretNotifyOptIn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function toggleSecretNotifyOptIn(): boolean {
  const next = !readSecretNotifyOptIn()
  writeSecretNotifyOptIn(next)
  return next
}
