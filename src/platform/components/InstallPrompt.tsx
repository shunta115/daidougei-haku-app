import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { useLang } from '../../i18n/LangProvider'

type InstallChoice = { outcome: 'accepted' | 'dismissed' }
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

const DISMISSED_KEY = 'pl-install-prompt-dismissed-at'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000
const GUIDE_OPEN_CLASS = 'pl-install-guide-open'

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || navigatorWithStandalone.standalone === true
}

function isIphoneSafari() {
  const agent = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(agent) && /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS/i.test(agent)
}

function ShareGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 3.4v11.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.6 7.6 12 3.4l4.4 4.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 12.4v6.2c0 .7.6 1.3 1.3 1.3h9c.7 0 1.3-.6 1.3-1.3v-6.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function StepShareFigure() {
  return (
    <div className="pl-install-figure" aria-hidden="true">
      <div className="pl-install-figure__bar">
        <span />
        <span />
        <b className="pl-install-figure__share">
          <i className="pl-install-figure__glow" />
          <ShareGlyph />
        </b>
        <span />
        <span />
      </div>
      <em className="pl-install-figure__pointer">↓</em>
    </div>
  )
}

function StepMenuFigure({ label }: { label: string }) {
  return (
    <div className="pl-install-figure pl-install-figure--menu" aria-hidden="true">
      <div className="pl-install-menu">
        <p><i /><span /><b /></p>
        <p className="is-target"><i>+</i><strong>{label}</strong></p>
        <p><i /><span /></p>
      </div>
    </div>
  )
}

function StepConfirmFigure({ cancel, add }: { cancel: string; add: string }) {
  return (
    <div className="pl-install-figure pl-install-figure--confirm" aria-hidden="true">
      <div className="pl-install-confirm">
        <span>{cancel}</span>
        <b>{add}</b>
      </div>
    </div>
  )
}

export function InstallPrompt() {
  const { t } = useLang()
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

  useEffect(() => {
    if (!open) return
    const body = document.body
    const root = document.documentElement
    const previousBodyOverflow = body.style.overflow
    const previousRootOverflow = root.style.overflow
    body.classList.add(GUIDE_OPEN_CLASS)
    body.style.overflow = 'hidden'
    root.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      body.classList.remove(GUIDE_OPEN_CLASS)
      body.style.overflow = previousBodyOverflow
      root.style.overflow = previousRootOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  const closeGuide = () => setOpen(false)
  const cueGuide = () => {
    document.getElementById('pl-install-cue')?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  return (
    <>
      <section className="pl-install-card" aria-label={t('installAria')}>
        <span className="pl-install-card__icon"><Download size={19} /></span>
        <div><strong>{t('installTitle')}</strong><small>{t('installLead')}</small></div>
        <button type="button" onClick={() => void beginInstall()}>{installEvent ? t('installNative') : t('installAdd')}</button>
        <button type="button" className="pl-install-card__dismiss" onClick={dismiss} aria-label={t('installDismiss')}><X size={16} /></button>
      </section>

      {open ? (
        <div className="pl-install-sheet" role="dialog" aria-modal="true" aria-labelledby="pl-install-title">
          <button type="button" className="pl-install-sheet__backdrop" onClick={closeGuide} aria-label={t('eventClose')} />
          <section className="pl-install-sheet__panel">
            <div className="pl-install-sheet__handle" aria-hidden="true" />
            <header>
              <BrandLogo size={56} variant="official" className="pl-install-sheet__logo" />
              <button type="button" onClick={closeGuide} aria-label={t('eventClose')}><X size={20} /></button>
            </header>
            <div className="pl-install-sheet__intro">
              <h2 id="pl-install-title">
                <span>{t('installSheetTitleStart')}</span>
                <span>
                  <em>{t('installSheetAccent')}</em>
                  {t('installSheetTitleEnd')}
                </span>
              </h2>
              <p>{t('installSheetLead')}</p>
            </div>

            <ol className="pl-install-steps">
              <li>
                <span>STEP 1</span>
                <strong>{t('installShare')}</strong>
                <StepShareFigure />
                <small>{t('installShareHint')}</small>
              </li>
              <li>
                <span>STEP 2</span>
                <strong>{t('installHome')}</strong>
                <StepMenuFigure label={t('installSheetAccent')} />
                <small>{t('installHomeHint')}</small>
              </li>
              <li>
                <span>STEP 3</span>
                <strong>{t('installConfirm')}</strong>
                <StepConfirmFigure cancel={t('installCancelAction')} add={t('installConfirmAction')} />
                <small>{t('installConfirmHint')}</small>
              </li>
            </ol>

            <ul className="pl-install-benefits">
              <li><b>⚡</b><div><strong>{t('installBenefitFast')}</strong><small>{t('installBenefitFastHint')}</small></div></li>
              <li><b>📅</b><div><strong>{t('installBenefitEvent')}</strong><small>{t('installBenefitEventHint')}</small></div></li>
              <li><b>★</b><div><strong>{t('installBenefitMore')}</strong><small>{t('installBenefitMoreHint')}</small></div></li>
            </ul>

            <button type="button" className="pl-install-sheet__done" onClick={cueGuide}>{t('installSheetCta')}</button>
            <p id="pl-install-cue" className="pl-install-sheet__cue">{t('installCue')}</p>
          </section>
        </div>
      ) : null}
    </>
  )
}
