import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
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

type Vars = Record<string, string | number>

type LangContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: I18nKey, vars?: Vars) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => 'ja' as Lang)
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : lang === 'zh-TW' ? 'zh-Hant' : 'ja'
  }, [lang])
  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: (next: Lang) => {
        writeLang(next)
        emit()
      },
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
      setLang: (next: Lang) => {
        writeLang(next)
        emit()
      },
      t: (key: I18nKey, vars?: Vars) => t(key, readLang(), vars),
    }
  }
  return ctx
}

const LANG_OPTIONS: Array<{ id: Lang; label: string }> = [
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'EN' },
  { id: 'zh-TW', label: '繁中' },
]

export function LanguageToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="pl-chip-row fe-lang" role="group" aria-label="Language" style={{ margin: 0 }}>
      {LANG_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="pl-chip fe-lang__btn"
          data-on={lang === option.id}
          aria-pressed={lang === option.id}
          onClick={() => setLang(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
