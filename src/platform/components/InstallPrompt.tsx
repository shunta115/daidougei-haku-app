import { useEffect, useState } from 'react'
import { ArrowUp, Download, PlusSquare, Share, X } from 'lucide-react'

type InstallChoice = { outcome: 'accepted' | 'dismissed' }
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

const DISMISSED_KEY = 'pl-install-prompt-dismissed-at'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || navigatorWithStandalone.standalone === true
}

function isIphoneSafari() {
  const agent = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(agent) && /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS/i.test(agent)
}

export function InstallPrompt() {
  const [eligible, setEligible] = useState(false)
  const [open, setOpen] = useState(false)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    let dismissedAt = 0
    try { dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) || 0) } catch { /* storage may be unavailable */ }
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return

    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
      setEligible(true)
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    if (isIphoneSafari()) setEligible(true)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  if (!eligible) return null

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* dismiss for this view only */ }
    setOpen(false)
    setEligible(false)
  }

  const beginInstall = async () => {
    if (!installEvent) {
      setOpen(true)
      return
    }
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setEligible(false)
    setInstallEvent(null)
  }

  return (
    <>
      <section className="pl-install-card" aria-label="ホーム画面に追加">
        <span className="pl-install-card__icon"><Download size={19} /></span>
        <div><strong>大道芸博をアプリにする</strong><small>ホーム画面から、すぐにLIVEへ。</small></div>
        <button type="button" onClick={() => void beginInstall()}>追加</button>
        <button type="button" className="pl-install-card__dismiss" onClick={dismiss} aria-label="ホーム画面への追加案内を閉じる"><X size={16} /></button>
      </section>

      {open ? (
        <div className="pl-install-sheet" role="dialog" aria-modal="true" aria-labelledby="pl-install-title">
          <button type="button" className="pl-install-sheet__backdrop" onClick={() => setOpen(false)} aria-label="閉じる" />
          <section className="pl-install-sheet__panel">
            <div className="pl-install-sheet__handle" aria-hidden="true" />
            <header><div><p>ADD TO HOME SCREEN</p><h2 id="pl-install-title">大道芸博をアプリにする</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="閉じる"><X size={20} /></button></header>
            <ol>
              <li><span><Share size={20} /></span><div><strong>Safariの共有を押す</strong><small>画面下の <ArrowUp size={13} /> が目印です</small></div></li>
              <li><span><PlusSquare size={20} /></span><div><strong>「ホーム画面に追加」</strong><small>メニューを少し下へスクロール</small></div></li>
              <li><b>3</b><div><strong>右上の「追加」</strong><small>次回からアイコンですぐに開けます</small></div></li>
            </ol>
            <button type="button" className="pl-install-sheet__done" onClick={dismiss}>わかりました</button>
          </section>
        </div>
      ) : null}
    </>
  )
}
