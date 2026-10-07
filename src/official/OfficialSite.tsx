import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, ExternalLink, Mail, X } from 'lucide-react'
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

function ImageButton({ src, alt, className = '', onOpen }: { src: string; alt: string; className?: string; onOpen: (image: LightboxImage) => void }) {
  return (
    <button type="button" className={`dg-image-button ${className}`} onClick={() => onOpen({ src, alt })} aria-label={`${alt}を拡大表示`}>
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
      <header className="dg-nav">
        <a href="/official" className="dg-nav__brand" aria-label="大道芸博 officialサイト トップ">大道芸博</a>
        <nav aria-label="公式サイト内ナビゲーション">
          <a href="#event">EVENT</a><a href="#history">HISTORY</a><a href="#contact">CONTACT</a>
        </nav>
      </header>

      <main>
        <section className="dg-hero" aria-labelledby="official-title">
          <p className="dg-kicker">大道芸博 officialサイト</p>
          <h1 id="official-title"><span>DAIDOGEI</span><span>HAKU！</span></h1>
          <div className="dg-hero__event">
            <p>AWP 2026</p>
            <h2>「受賞者たち」</h2>
            <dl><div><dt>DATE</dt><dd>2026.10.10 - 10.12</dd></div><div><dt>PLACE</dt><dd>東京・練馬城址公園</dd></div></dl>
            <strong>入場無料</strong>
          </div>
          <ImageButton src={AWP_FRONT} alt="AWP 2026 受賞者たち 公式ビジュアル" className="dg-hero__visual" onOpen={setLightbox} />
        </section>

        <section id="event" className="dg-section dg-event">
          <p className="dg-section__label">CURRENT EVENT</p><h2>今回のイベント</h2>
          <div className="dg-event__pair">
            <ImageButton src={AWP_FRONT} alt="AWP 2026 受賞者たち 表面" className="dg-event__front" onOpen={setLightbox} />
            <ImageButton src={AWP_BACK} alt="AWP 2026 会場MAP・裏面" className="dg-event__back" onOpen={setLightbox} />
          </div>
          <a className="dg-program" href="/events/award-winning-performers-2026"><span><small>PROGRAM</small>プログラムはこちら！</span><ArrowRight aria-hidden="true" /></a>
        </section>

        <section id="history" className="dg-section">
          <p className="dg-section__label">OUR HISTORY</p><h2>過去の開催実績</h2>
          <div className="dg-history" aria-label="歴代チラシ">
            {history.map((item) => <article className="dg-history__card" key={`${item.date}-${item.place}`}><ImageButton src={item.src} alt={`${item.date} ${item.place} 大道芸博 公式チラシ`} onOpen={setLightbox} /><p>{item.date}</p><h3>{item.place}</h3></article>)}
          </div>
        </section>

        <section className="dg-section">
          <p className="dg-section__label">MEDIA</p><h2>メディア掲載</h2>
          <p className="dg-copy">テレビ・新聞など、これまでに取り上げていただいた実績です。</p>
          <div className="dg-media">
            <article><ImageButton src="/official/media/media-stage-1.jpg" alt="大道芸博 開催風景" onOpen={setLightbox} /><div><small>TELEVISION</small><h3>TBS「Nスタ」</h3></div></article>
            <article><ImageButton src="/official/media/media-stage-2.jpg" alt="大道芸博 開催風景" onOpen={setLightbox} /><div><small>NEWSPAPER</small><h3>東京新聞</h3></div></article>
          </div>
        </section>

        <section id="contact" className="dg-section dg-contact">
          <p className="dg-section__label">CONTACT</p><h2>お問い合わせ</h2>
          <p className="dg-copy">イベント、出演、企業・協賛、取材についてのお問い合わせはこちらからお送りください。</p>
          <form onSubmit={submitContact}>
            <label>名前<input name="name" autoComplete="name" required /></label>
            <label>メールアドレス<input name="email" type="email" autoComplete="email" required /></label>
            <label>お問い合わせ種別<select name="category" required defaultValue="一般のお問い合わせ"><option>一般のお問い合わせ</option><option>出演について</option><option>企業・協賛について</option><option>取材・メディア</option><option>その他</option></select></label>
            <label>お問い合わせ内容<textarea name="message" rows={7} required /></label>
            <button type="submit"><Mail size={18} aria-hidden="true" />メールを作成する</button>
          </form>
        </section>

        <section className="dg-haku"><p>STREET PERFORMANCE, CLOSER.</p><h2>世界が舞台。<br />いま、あなたは最前列。</h2><a href="/">HAKUを開く <ExternalLink size={17} aria-hidden="true" /></a></section>
      </main>

      <footer><p>大道芸博 officialサイト</p><small>DAIDOGEIHAKU！</small></footer>

      {lightbox ? <div className="dg-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.alt} onClick={() => setLightbox(null)}><button type="button" onClick={() => setLightbox(null)} aria-label="閉じる"><X /></button><img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} /></div> : null}
    </div>
  )
}
