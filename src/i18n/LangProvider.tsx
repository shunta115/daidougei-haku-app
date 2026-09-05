import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { readLang, t, writeLang, type I18nKey, type Lang } from './index'

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

type LangContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: I18nKey) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => 'ja' as Lang)
  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: (next: Lang) => {
        writeLang(next)
        emit()
      },
      t: (key: I18nKey) => t(key, lang),
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
      setLang: (next: Lang) => {
        writeLang(next)
        emit()
      },
      t: (key: I18nKey) => t(key),
    }
  }
  return ctx
}

export function LanguageToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="pl-chip-row fe-lang" style={{ margin: 0 }}>
      <button type="button" className="pl-chip fe-lang__btn" data-on={lang === 'ja'} onClick={() => setLang('ja')}>
        日本語
      </button>
      <button type="button" className="pl-chip fe-lang__btn" data-on={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  )
}
