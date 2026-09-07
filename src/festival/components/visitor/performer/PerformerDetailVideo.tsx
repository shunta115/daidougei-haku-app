import type { Performer } from '../../../types'

type PerformerDetailVideoProps = {
  performer: Performer
}

export function PerformerDetailVideo({ performer }: PerformerDetailVideoProps) {
  const url = performer.introVideoUrl
  if (!url) return null

  return (
    <section className="fe-pdv" aria-labelledby="fe-pdv-title">
      <h2 id="fe-pdv-title" className="fe-pdv__title">
        30秒紹介
      </h2>
      <div className="fe-pdv__frame">
        {url ? (
          <video
            className="fe-pdv__video"
            src={url}
            controls
            playsInline
            preload="metadata"
            poster={performer.photoUrl}
          >
            お使いのブラウザは動画再生に対応していません。
          </video>
        ) : (
          <div className="fe-pdv__placeholder" aria-hidden="true">
            <span className="fe-pdv__play">▶</span>
            <p className="fe-pdv__placeholder-k">紹介動画（準備中）</p>
            <p className="fe-pdv__placeholder-t">30秒ダイジェスト · デモ枠</p>
          </div>
        )}
      </div>
    </section>
  )
}
