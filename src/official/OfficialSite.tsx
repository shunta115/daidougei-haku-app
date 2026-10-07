import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Mail, X } from 'lucide-react'
import './official-site.css'

const CONTACT_EMAIL = 'itonorihisa.office@gmail.com'
const AWP_FRONT = '/events/award-winning-performers-2026/official-flyer-2026.webp'
const AWP_BACK = '/events/award-winning-performers-2026/official-venue-map.webp'

type LightboxImage = { src: string; alt: string } | null

const history = [
  { date: '2024年5月', place: 'TOKYO', src: '/official/history/tokyo-2024.jpg' },
  { date: '2024年9月', place: 'ENCORE', src: '/official/history/encore-2024.jpg' },
  { date: '2025年5月', place: 'NAGOYA', src: '/official/history/nagoya-2025.jpg' },
  { date: '2025年11月', place: 'TOKYO', src: '/official/history/tokyo-2025.jpg' },
  { date: '2026年5月', place: 'TOKYO', src: '/official/history/tokyo-2026.jpg' },
]

function ImageButton({
  src,
  alt,
  className = '',
  onOpen,
}: {
  src: string
  alt: string
  className?: string
  onOpen: (image: LightboxImage) => void
}) {
  return (
    <button
      type="button"
      className={`dg-image-button ${className}`}
      onClick={() => onOpen({ src, alt })}
      aria-label={`${alt}を拡大表示`}
    >
      <img src={src} alt={alt} loading="lazy" />
    </button>
  )
}

export function OfficialSite() {
  const [lightbox, setLightbox] = useState<LightboxImage>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = '大道芸博 officialサイト | DAIDOGEIHAKU！'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setLightbox(null) }
    document.body.classList.add('dg-modal-open')
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('dg-modal-open')
      window.removeEventListener('keydown', close)
    }
  }, [lightbox])

  const goBack = () => {
    const fromSameOrigin = document.referrer.startsWith(window.location.origin)
    if (fromSameOrigin && window.history.length > 1) window.history.back()
    else window.location.href = '/'
  }

  const submitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const category = String(data.get('category') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    const subject = encodeURIComponent(`【大道芸博】${category}`)
    const body = encodeURIComponent(`お名前：${name}\nメールアドレス：${email}\nお問い合わせ種別：${category}\n\n${message}`)
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div className="dg-site">
      <header className="dg-topbar">
        <button type="button" className="dg-back" onClick={goBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          HAKUに戻る
        </button>
        <a className="dg-topbar__brand" href="/official">
          <small>大道芸博 officialサイト</small>
          <strong>DAIDOGEIHAKU！</strong>
        </a>
      </header>

      <main>
        <section className="dg-hero">
          <div className="dg-hero__grid">
            <div className="dg-hero__copy">
              <p className="dg-eyebrow">CURRENT EVENT</p>
              <h1>AWP 2026<br />「受賞者たち」</h1>
              <p className="dg-lead">
                国内外で受賞歴のあるパフォーマーが集結する、特別な3日間。
                出演者・プログラム・会場情報をご案内します。
              </p>
              <div className="dg-pills">
                <span>2026.10.10 - 10.12</span>
                <span>練馬城址公園</span>
                <span>入場無料</span>
              </div>
            </div>

            <div className="dg-hero__poster">
              <ImageButton
                src={AWP_FRONT}
                alt="AWP 2026 受賞者たち 公式ビジュアル"
                onOpen={setLightbox}
              />
            </div>
          </div>
        </section>

        <section id="event" className="dg-section">
          <div className="dg-inner dg-center">
            <p className="dg-eyebrow">AWP 2026</p>
            <h2>今回のイベント</h2>
            <p className="dg-lead dg-lead--center">
              2026年10月10日〜12日、東京・練馬城址公園で開催。
              入場無料でお楽しみいただけます。
            </p>

            <div className="dg-event-pair">
              <article>
                <div className="dg-flyer-card dg-flyer-card--front">
                  <ImageButton
                    src={AWP_FRONT}
                    alt="AWP 2026 受賞者たち 表面"
                    onOpen={setLightbox}
                  />
                </div>
                <span className="dg-tag">AWP 2026 / 表面</span>
                <p>出演者とAWPの世界観をご覧いただけます。</p>
              </article>

              <article>
                <div className="dg-flyer-card dg-flyer-card--back">
                  <ImageButton
                    src={AWP_BACK}
                    alt="AWP 2026 会場MAP・裏面"
                    onOpen={setLightbox}
                  />
                </div>
                <span className="dg-tag">AWP 2026 / 裏面</span>
                <p>会場MAP・アクセス・HAKUのご案内はこちら。</p>
              </article>
            </div>

            <a className="dg-program" href="/events/award-winning-performers-2026">
              <span>
                <small>タイムテーブル・出演者情報</small>
                <b>プログラムはこちら！</b>
              </span>
              <ArrowRight size={30} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="contact" className="dg-section dg-section--soft">
          <div className="dg-inner dg-contact">
            <div>
              <p className="dg-eyebrow">CONTACT</p>
              <h2>お問い合わせ</h2>
              <p className="dg-lead">
                イベントに関するご質問、出演希望、企業協賛、取材・メディアなど、
                お気軽にお問い合わせください。
              </p>
            </div>

            <form onSubmit={submitContact}>
              <label>名前<input name="name" autoComplete="name" required /></label>
              <label>メールアドレス<input name="email" type="email" autoComplete="email" required /></label>
              <label>
                お問い合わせ種別
                <select name="category" required defaultValue="一般のお問い合わせ">
                  <option>一般のお問い合わせ</option>
                  <option>出演について</option>
                  <option>企業・協賛について</option>
                  <option>取材・メディア</option>
                  <option>その他</option>
                </select>
              </label>
              <label>お問い合わせ内容<textarea name="message" rows={7} required /></label>
              <button type="submit"><Mail size={18} aria-hidden="true" />メールで問い合わせる</button>
            </form>
          </div>
        </section>

        <section id="history" className="dg-section">
          <div className="dg-inner">
            <p className="dg-eyebrow">HISTORY</p>
            <h2>過去の開催実績</h2>
            <p className="dg-lead">これまでの大道芸博を、歴代の公式チラシで振り返ります。</p>
            <div className="dg-history">
              {history.map((item) => (
                <article className="dg-history__card" key={`${item.date}-${item.place}`}>
                  <ImageButton
                    src={item.src}
                    alt={`${item.date} ${item.place} 大道芸博 公式チラシ`}
                    onOpen={setLightbox}
                  />
                  <div>
                    <b>{item.date} {item.place}</b>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="dg-section dg-section--soft">
          <div className="dg-inner">
            <p className="dg-eyebrow">MEDIA</p>
            <h2>メディア掲載</h2>
            <p className="dg-lead">テレビ・新聞など、これまでに取り上げていただいた実績です。</p>
            <div className="dg-media">
              <article>
                <ImageButton src="/official/media/media-stage-1.jpg" alt="TBS Nスタ 掲載" onOpen={setLightbox} />
                <div><b>📺 TBS「Nスタ」</b><small>大道芸博を取材・放送</small></div>
              </article>
              <article>
                <ImageButton src="/official/media/media-stage-2.jpg" alt="東京新聞 掲載" onOpen={setLightbox} />
                <div><b>📰 東京新聞</b><small>新聞掲載</small></div>
              </article>
            </div>
          </div>
        </section>

        <section className="dg-haku">
          <div>
            <p>STREET PERFORMANCE, CLOSER.</p>
            <h2>世界が舞台。<br />いま、あなたは最前列。</h2>
          </div>
          <a href="/">HAKUを開く <ExternalLink size={17} aria-hidden="true" /></a>
        </section>
      </main>

      <footer>
        <div>
          <small>大道芸博 officialサイト</small>
          <strong>DAIDOGEIHAKU！</strong>
        </div>
        <span>© 2026 DAIDOGEIHAKU / HAKU</span>
      </footer>

      {lightbox ? (
        <div
          className="dg-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <button type="button" onClick={() => setLightbox(null)} aria-label="閉じる"><X /></button>
          <img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  )
}
