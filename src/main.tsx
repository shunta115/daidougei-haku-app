import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  let reloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => registration.update()).catch(() => {
      /* ignore SW registration/update failures in unsupported contexts */
    })
  })
}

