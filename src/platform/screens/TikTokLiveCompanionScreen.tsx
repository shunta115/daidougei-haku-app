import { ExternalLink, Gift, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/LangProvider'
import { getPerformer } from '../lib/api'
import { trackProductEvent } from '../lib/track'
import type { Performer } from '../lib/types'
import './tiktok-live-companion.css'

type Props = {
  handle: string
  performerId: string | null
  liveUrl: string
  onBack: () => void
  onTip: () => void
}

const copy = {
  ja: {
    kicker: 'HAKU CONNECT LIVE',
    title: 'TikTok LIVEを見ながら応援',
    lead: '映像とTikTokのコメント・ギフトは公式TikTokで楽しみ、HAKUの応援はこのページから届けられます。',
    official: 'TikTok LIVEを開く',
    howTitle: 'iPhoneでの使い方',
    how: 'TikTok LIVEを開き、視聴後にSafariのこのタブへ戻るとHAKU投げ銭を利用できます。',
    tip: 'HAKUで投げ銭する',
    noTip: 'このTikTok配信はHAKUパフォーマーに未接続のため、投げ銭先を表示できません。',
    separation: 'TikTokのギフトとHAKU投げ銭は別のサービス・別の台帳です。HAKUはTikTokの映像やギフトを取得・再配信しません。',
    status: '公式外部視聴モード',
    back: '戻る',
  },
  en: {
    kicker: 'HAKU CONNECT LIVE',
    title: 'Watch on TikTok, support on HAKU',
    lead: 'Watch video and use TikTok comments and Gifts in the official TikTok experience, then support the performer here on HAKU.',
    official: 'Open TikTok LIVE',
    howTitle: 'On iPhone',
    how: 'Open TikTok LIVE, then return to this Safari tab whenever you want to send a HAKU tip.',
    tip: 'Tip on HAKU',
    noTip: 'This TikTok LIVE is not linked to a HAKU performer, so a tip destination cannot be shown.',
    separation: 'TikTok Gifts and HAKU tips are separate services and separate ledgers. HAKU does not extract or restream TikTok video or Gifts.',
    status: 'Official external viewing mode',
    back: 'Back',
  },
  'zh-TW': {
    kicker: 'HAKU CONNECT LIVE',
    title: '在 TikTok 觀看，在 HAKU 支持',
    lead: '影片、TikTok 留言與禮物請使用官方 TikTok；HAKU 的支持可由本頁送出。',
    official: '開啟 TikTok LIVE',
    howTitle: 'iPhone 使用方式',
    how: '開啟 TikTok LIVE 觀看，需要 HAKU 投幣時再回到 Safari 的這個分頁。',
    tip: '在 HAKU 投幣',
    noTip: '此 TikTok LIVE 尚未連結 HAKU 表演者，因此無法顯示投幣對象。',
    separation: 'TikTok 禮物與 HAKU 投幣是不同服務、不同帳本。HAKU 不會擷取或轉播 TikTok 影片與禮物。',
    status: '官方外部觀看模式',
    back: '返回',
  },
} as const

export function TikTokLiveCompanionScreen({ handle, performerId, liveUrl, onBack, onTip }: Props) {
  const { lang } = useLang()
  const text = copy[lang]
  const [performer, setPerformer] = useState<Performer | null>(null)

  useEffect(() => {
    let alive = true
    if (!performerId) {
      setPerformer(null)
      return () => { alive = false }
    }
    getPerformer(performerId)
      .then((row) => { if (alive && row?.is_approved) setPerformer(row) })
      .catch(() => { if (alive) setPerformer(null) })
    return () => { alive = false }
  }, [performerId])

  return (
    <main className="pl-tiktok-live" data-testid="tiktok-live-companion">
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>{text.back}</button>

      <section className="pl-tiktok-live__hero">
        <p>{text.kicker}</p>
        <h1>{text.title}</h1>
        <span>{text.lead}</span>
        <div className="pl-tiktok-live__status"><span aria-hidden="true" />{text.status}</div>
      </section>

      <section className="pl-tiktok-live__viewer" aria-label={`TikTok @${handle} LIVE`}>
        <div className="pl-tiktok-live__mark" aria-hidden="true">♪</div>
        <div><strong>@{handle}</strong><small>TikTok LIVE</small></div>
        <a
          className="pl-btn pl-tiktok-live__open"
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer external"
          onClick={() => trackProductEvent('live_view_start', { performerId, props: { provider: 'tiktok', handle, mode: 'official_external' } })}
        >
          {text.official} <ExternalLink size={17} aria-hidden="true" />
        </a>
      </section>

      <section className="pl-tiktok-live__guide">
        <h2>{text.howTitle}</h2>
        <p>{text.how}</p>
      </section>

      {performer ? (
        <button
          type="button"
          className="pl-btn pl-btn--tip pl-btn--block pl-tiktok-live__tip"
          onClick={() => {
            trackProductEvent('tip_cta_click', { performerId: performer.id, props: { surface: 'tiktok_live_companion' } })
            onTip()
          }}
        >
          <Gift size={19} aria-hidden="true" /> {text.tip} · {performer.stage_name}
        </button>
      ) : <p className="pl-tiktok-live__unlinked" role="status">{text.noTip}</p>}

      <p className="pl-tiktok-live__separation"><ShieldCheck size={18} aria-hidden="true" /> <span>{text.separation}</span></p>
    </main>
  )
}

