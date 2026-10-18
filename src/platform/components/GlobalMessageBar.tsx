import { Globe2 } from 'lucide-react'
import { useLang } from '../../i18n/LangProvider'
import { more } from '../../i18n/more'
import './global-message-bar.css'

export function GlobalMessageBar({ className = '' }: { className?: string }) {
  const lang = useLang()?.lang ?? 'ja'
  const messages = lang === 'en' ? more.en : lang === 'zh-TW' ? more.zh : more.ja
  const message = messages.globalMessage
  const label = messages.globalLabel

  return (
    <aside className={`pl-global-message${className ? ` ${className}` : ''}`} aria-label={label}>
      <span className="pl-global-message__label"><Globe2 size={13} aria-hidden="true" />{label}</span>
      <span className="pl-global-message__viewport">
        <span className="pl-global-message__sr">{message}</span>
        <span className="pl-global-message__track" aria-hidden="true">
          <span>{message}</span><span>{message}</span>
        </span>
      </span>
    </aside>
  )
}
