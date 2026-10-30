import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { useLang } from '../../i18n/LangProvider'
import type { PerformerAppearance } from '../lib/types'
import { appearanceLandingUrl, appearanceShareLinks, appearanceShareText, copyAppearanceUrl, shareAppearance } from '../lib/appearanceShare'
import './appearance-share.css'

export function AppearanceShareActions({ appearance, performerId, stageName }: {
  appearance: PerformerAppearance; performerId: string; stageName: string
}) {
  const { lang } = useLang()
  const [feedback, setFeedback] = useState('')
  const text = lang === 'en'
    ? { share: 'Share', copy: 'Copy appearance URL', copied: 'Link copied', shared: 'Shared', failed: 'Could not share. Please try again.' }
    : lang === 'zh-TW'
      ? { share: '分享', copy: '複製演出網址', copied: '已複製連結', shared: '已分享', failed: '無法分享，請再試一次。' }
      : { share: '共有', copy: '出演予定URLをコピー', copied: 'URLをコピーしました', shared: '共有しました', failed: '共有できませんでした。もう一度お試しください。' }
  const url = appearanceLandingUrl(window.location.origin, performerId, appearance.id)
  const message = appearanceShareText(stageName, appearance)
  const social = appearanceShareLinks(url, message)
  const act = async (copy: boolean) => {
    setFeedback('')
    try {
      const result = copy ? (await copyAppearanceUrl(url), 'copied') : await shareAppearance(url, message)
      if (result !== 'cancelled') setFeedback(result === 'copied' ? text.copied : text.shared)
    } catch { setFeedback(text.failed) }
  }
  return <>
    <div className="pl-appearance-share" aria-label={text.share}>
      <a href={social.line} target="_blank" rel="noopener noreferrer">LINE</a>
      <a href={social.x} target="_blank" rel="noopener noreferrer">X</a>
      <button type="button" onClick={() => void act(false)}><Share2 size={14} />{text.share}</button>
      <button type="button" onClick={() => void act(true)} aria-label={text.copy}><Copy size={14} /></button>
    </div>
    {feedback ? <p className="pl-appearance-share__feedback" role="status">{feedback}</p> : null}
  </>
}
