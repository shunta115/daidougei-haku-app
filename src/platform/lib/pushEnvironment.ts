export function pushEnvironment() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return { ios, standalone, supported, needsInstall: ios && !standalone, denied: supported && Notification.permission === 'denied' }
}
