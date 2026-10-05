import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { readLang, t, writeLang, type I18nKey, type Lang } from './index'

const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

type Vars = Record<string, string | number>

type LangContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: I18nKey, vars?: Vars) => string
}

const LangContext = createContext<LangContextValue | null>(null)

function applyLang(next: Lang, current: Lang) {
  if (next === current) return
  writeLang(next)
  listeners.forEach((listener) => listener())
}

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => 'ja' as Lang)
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : lang === 'zh-TW' ? 'zh-Hant' : 'ja'
  }, [lang])
  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: (next: Lang) => applyLang(next, lang),
      t: (key: I18nKey, vars?: Vars) => t(key, lang, vars),
    }),
    [lang],
  )
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) {
    return {
      lang: readLang(),
      setLang: (next: Lang) => applyLang(next, readLang()),
      t: (key: I18nKey, vars?: Vars) => t(key, readLang(), vars),
    }
  }
  return ctx
}

const LANG_OPTIONS: Array<{ id: Lang; short: string; label: string }> = [
  { id: 'ja', short: 'JA', label: '日本語' },
  { id: 'en', short: 'EN', label: 'English' },
  { id: 'zh-TW', short: '繁中', label: '繁體中文' },
]

export function LanguageToggle() {
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const current = LANG_OPTIONS.find((option) => option.id === lang) ?? LANG_OPTIONS[0]

  return (
    <div className="pl-lang-switch">
      <button
        type="button"
        className="pl-lang-switch__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={current.label}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🌐</span>
        <span>{current.short}</span>
      </button>
      {open ? (
        <div className="pl-lang-sheet" role="dialog" aria-modal="true" aria-label="Language">
          <button type="button" className="pl-lang-sheet__backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="pl-lang-sheet__panel">
            <div className="pl-lang-sheet__handle" aria-hidden="true" />
            {LANG_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pl-lang-sheet__option"
                data-on={lang === option.id}
                aria-pressed={lang === option.id}
                onClick={() => {
                  setOpen(false)
                  if (option.id !== lang) setLang(option.id)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
