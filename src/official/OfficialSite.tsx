import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Mail, Menu, X } from 'lucide-react'
import { DAIDOGEI_HAKU_X_URL } from '../config/officialLinks'
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
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = '大道芸博 officialサイト | DAIDOGEIHAKU！'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null)
    }
    document.body.classList.add('dg-modal-open')
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('dg-modal-open')
      window.removeEventListener('keydown', close)
    }
  }, [lightbox])

  const goBack = () => {
    const sameOriginReferrer = document.referrer.startsWith(window.location.origin)
    if (sameOriginReferrer && window.history.length > 1) {
      window.history.back()
      return
    }
    window.location.href = '/'
  }

  const submitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const category = String(data.get('category') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    const subject = encodeURIComponent(`【大道芸博】${category}`)
    const body = encodeURIComponent(
      `お名前：${name}\nメールアドレス：${email}\nお問い合わせ種別：${category}\n\n${message}`,
    )
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div className="dg-site">
      <section className="hero">
        <div className="top">
          <div className="title">
            <small>大道芸博 officialサイト</small>
            <h1 aria-label="DAIDOGEI HAKU！">DAIDOGEIHAKU！</h1>
            <p>大道芸博の公式情報を、ここから。</p>
          </div>
          <div className="topActions">
            <a className="officialX" href={DAIDOGEI_HAKU_X_URL} target="_blank" rel="noopener noreferrer" aria-label="大道芸博公式Xを新しいタブで開く"><span aria-hidden="true">X</span><b>公式X</b><ExternalLink size={14} aria-hidden="true" /></a>
            <button
              type="button"
              className="menu"
              aria-label="メニューを開く"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={28} /> : <Menu size={30} />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="siteMenu" aria-label="公式サイトメニュー">
            <button type="button" onClick={goBack}><ArrowLeft size={16} />HAKUに戻る</button>
            <a href="#event" onClick={() => setMenuOpen(false)}>今回のイベント</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>お問い合わせ</a>
            <a href="#history" onClick={() => setMenuOpen(false)}>過去の開催実績</a>
            <a href="#media" onClick={() => setMenuOpen(false)}>メディア掲載</a>
            <a href={DAIDOGEI_HAKU_X_URL} target="_blank" rel="noopener noreferrer"><span className="menuX" aria-hidden="true">X</span>公式X・最新情報<ExternalLink size={14} aria-hidden="true" /></a>
          </nav>
        ) : null}

        <div className="heroGrid">
          <div className="heroCopy">
            <div className="eyebrow">CURRENT EVENT</div>
            <h2>AWP 2026<br />「受賞者たち」</h2>
            <p>
              国内外で受賞歴のあるパフォーマーが集結する、特別な3日間。
              出演者・プログラム・会場情報をご案内します。
            </p>
            <div className="pills">
              <div className="pill">2026.10.10 - 10.12</div>
              <div className="pill">練馬城址公園</div>
              <div className="pill">入場無料</div>
            </div>
          </div>

          <div className="poster">
            <ImageButton
              src={AWP_FRONT}
              alt="AWP 2026 受賞者たち 公式ビジュアル"
              onOpen={setLightbox}
            />
          </div>
        </div>
      </section>

      <section id="event" className="section">
        <div className="inner">
          <div className="eyebrow">AWP 2026</div>
          <h3>今回のイベント</h3>
          <p className="lead materialsIntro">
            2026年10月10日〜12日、東京・練馬城址公園で開催。
            入場無料でお楽しみいただけます。
          </p>

          <div className="materials">
            <div className="material">
              <div className="flyerCard">
                <ImageButton
                  src={AWP_FRONT}
                  alt="AWP 2026 受賞者たち 表面"
                  onOpen={setLightbox}
                />
              </div>
              <div className="tag">AWP 2026 / 表面</div>
              <div className="materialCaption">出演者とAWPの世界観をご覧いただけます。</div>
              <div className="imageHint">タップで拡大</div>
            </div>

            <div className="material">
              <div className="flyerCard">
                <ImageButton
                  src={AWP_BACK}
                  alt="AWP 2026 会場MAP・裏面"
                  onOpen={setLightbox}
                />
              </div>
              <div className="tag">AWP 2026 / 裏面</div>
              <div className="materialCaption">会場MAP・アクセス・HAKUのご案内はこちら。</div>
              <div className="imageHint">タップで拡大</div>
            </div>
          </div>

          <a className="cta" href="/events/award-winning-performers-2026">
            <div>
              <small>タイムテーブル・出演者情報</small><br />
              <strong>プログラムはこちら！</strong>
            </div>
            <ArrowRight size={30} aria-hidden="true" />
          </a>
          <div className="note">最新のタイムテーブル・出演者情報はHAKUでご確認いただけます。</div>
        </div>
      </section>

      <section id="contact" className="section soft">
        <div className="inner contact">
          <div>
            <div className="eyebrow">CONTACT</div>
            <h3>お問い合わせ</h3>
            <p className="lead">
              イベントに関するご質問、出演希望、企業協賛、取材・メディアなど、
              お気軽にお問い合わせください。
            </p>
          </div>

          <form onSubmit={submitContact}>
            <input name="name" placeholder="お名前" autoComplete="name" required />
            <input name="email" type="email" placeholder="メールアドレス" autoComplete="email" required />
            <select name="category" defaultValue="一般のお問い合わせ">
              <option>一般のお問い合わせ</option>
              <option>出演について</option>
              <option>企業・協賛について</option>
              <option>取材・メディア</option>
              <option>その他</option>
            </select>
            <textarea name="message" placeholder="お問い合わせ内容" required />
            <button className="submit" type="submit"><Mail size={18} />メールで問い合わせる</button>
          </form>
        </div>
      </section>

      <section id="history" className="section">
        <div className="inner">
          <div className="eyebrow">HISTORY</div>
          <h3>過去の開催実績</h3>
          <p className="lead">これまでの大道芸博を、歴代の公式チラシで振り返ります。</p>
          <div className="history">
            {history.map((item) => (
              <article className="card historyCard" key={`${item.date}-${item.place}`}>
                <ImageButton
                  src={item.src}
                  alt={`${item.date} ${item.place} 大道芸博 公式チラシ`}
                  onOpen={setLightbox}
                />
                <div className="cap">
                  <b>{item.date} {item.place}</b>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="media" className="section soft">
        <div className="inner">
          <div className="eyebrow">MEDIA</div>
          <h3>メディア掲載</h3>
          <p className="lead">テレビ・新聞など、これまでに取り上げていただいた実績です。</p>
          <div className="mediaGrid">
            <article className="mediaCard">
              <ImageButton
                src="/official/media/media-stage-1.jpg"
                alt="TBS Nスタ 掲載"
                onOpen={setLightbox}
              />
              <div className="cap"><b>📺 TBS「Nスタ」</b><br /><small>大道芸博を取材・放送</small></div>
            </article>
            <article className="mediaCard">
              <ImageButton
                src="/official/media/media-stage-2.jpg"
                alt="東京新聞 掲載"
                onOpen={setLightbox}
              />
              <div className="cap"><b>📰 東京新聞</b><br /><small>新聞掲載</small></div>
            </article>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footerInner">
          <div>
            <b>大道芸博 officialサイト<br />DAIDOGEIHAKU！</b>
            <div style={{ marginTop: 10 }}>AWP 2026「受賞者たち」</div>
          </div>
          <div className="footerLinks"><a href={DAIDOGEI_HAKU_X_URL} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">X</span>開催情報・最新のお知らせ</a><small>© 2026 DAIDOGEIHAKU / HAKU</small></div>
        </div>
      </footer>

      <a className="stickyHAKU" href="/">HAKUを開く ↗</a>

      {lightbox ? (
        <div
          className="lightbox open"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <div className="lightboxInner" onClick={(event) => event.stopPropagation()}>
            <button className="lightboxClose" type="button" onClick={() => setLightbox(null)} aria-label="閉じる">×</button>
            <img src={lightbox.src} alt={lightbox.alt} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
