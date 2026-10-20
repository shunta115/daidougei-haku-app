type NotificationRefreshEnvironment = {
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
}

export function startNotificationRefresh(
  load: () => Promise<void>,
  intervalMs = 5_000,
  environment: NotificationRefreshEnvironment = { window, document },
) {
  let active = true
  let loading = false
  let refreshAgain = false

  const refresh = async () => {
    if (!active) return
    if (loading) {
      refreshAgain = true
      return
    }
    loading = true
    try {
      do {
        refreshAgain = false
        await load()
      } while (active && refreshAgain)
    } finally {
      loading = false
    }
  }

  const refreshWhenVisible = () => {
    if (environment.document.visibilityState === 'visible') void refresh()
  }

  environment.window.addEventListener('focus', refreshWhenVisible)
  environment.window.addEventListener('online', refreshWhenVisible)
  environment.document.addEventListener('visibilitychange', refreshWhenVisible)
  const timer = environment.window.setInterval(refreshWhenVisible, intervalMs)
  void refresh()

  return () => {
    active = false
    refreshAgain = false
    environment.window.clearInterval(timer)
    environment.window.removeEventListener('focus', refreshWhenVisible)
    environment.window.removeEventListener('online', refreshWhenVisible)
    environment.document.removeEventListener('visibilitychange', refreshWhenVisible)
  }
}
