import { useState } from 'react'
import type { Performer, ProgramPulse } from '../../types'
import { initials } from '../../lib/initials'
import { readAdminOps } from '../../lib/adminOpsStorage'

type LiveStreamDeckProps = {
  live: ProgramPulse | null
  livePerformer?: Performer
  onWatch: () => void
  onCheer: () => void
  onFan: () => void
}

export function LiveStreamDeck({ live, livePerformer, onWatch, onCheer, onFan }: LiveStreamDeckProps) {
  const ops = readAdminOps()
  const [fan, setFan] = useState(false)

  const standby = ops.liveChannel === 'standby' || ops.liveChannel === 'off'
  const liveOn = ops.liveChannel === 'live' && Boolean(live && livePerformer)

  return (
    <section className="fe-ldeck" aria-label="公式ライブ視聴（モック）">
      <div className="fe-ldeck__head">
        <h2 className="fe-ldeck__title">
          <span className="fe-ldeck__eyebrow" lang="en">
            FESTIVAL CHANNEL
          </span>
          ライブ視聴
        </h2>
        <p className="fe-ldeck__lead">配信エンジンはモック。視聴・応援・ファン導線の体験モデルです。</p>
      </div>

      <div className="fe-ldeck__grid">
        <article className={`fe-ldeck__panel fe-ldeck__panel--live${liveOn ? ' fe-ldeck__panel--on' : ''}`}>
          <span className="fe-ldeck__tag">LIVE</span>
          {liveOn && livePerformer ? (
            <>
              <div
                className={`fe-ldeck__thumb${livePerformer.photoUrl ? ' fe-ldeck__thumb--photo' : ''}`}
                style={
                  livePerformer.photoUrl
                    ? { backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.75)), url(${livePerformer.photoUrl})` }
                    : { background: livePerformer.gradient }
                }
              >
                {!livePerformer.photoUrl ? <span>{initials(livePerformer.name)}</span> : null}
              </div>
              <p className="fe-ldeck__name">{livePerformer.nameJa}</p>
              <p className="fe-ldeck__sub">{live?.stageJa}</p>
            </>
          ) : (
            <p className="fe-ldeck__idle">オフエア — 演目が入るとカードが点灯します</p>
          )}
          <button type="button" className="fe-ldeck__cta" onClick={onWatch}>
            視聴する
          </button>
        </article>

        <article className={`fe-ldeck__panel fe-ldeck__panel--standby${standby ? ' fe-ldeck__panel--pulse' : ''}`}>
          <span className="fe-ldeck__tag fe-ldeck__tag--standby">STANDBY</span>
          <p className="fe-ldeck__name">配信待機中</p>
          <p className="fe-ldeck__sub">カウント · 音響 · 都市ノイズ</p>
          <button type="button" className="fe-ldeck__cta fe-ldeck__cta--ghost" onClick={onWatch}>
            待機画面へ
          </button>
        </article>

        <article className="fe-ldeck__panel fe-ldeck__panel--arc">
          <span className="fe-ldeck__tag fe-ldeck__tag--arc">ARCHIVE</span>
          <p className="fe-ldeck__name">昨夜のハイライト</p>
          <p className="fe-ldeck__sub">編集部キュレーション（デモ）</p>
          <button type="button" className="fe-ldeck__cta fe-ldeck__cta--ghost" onClick={onWatch}>
            再生
          </button>
        </article>
      </div>

      <div className="fe-ldeck__actions">
        <button type="button" className="fe-ldeck__pill" onClick={onCheer}>
          拍手を送る
        </button>
        <button type="button" className="fe-ldeck__pill fe-ldeck__pill--heart" onClick={onCheer}>
          ハートを送る
        </button>
        <button type="button" className="fe-ldeck__pill fe-ldeck__pill--msg" onClick={onCheer}>
          メッセージ
        </button>
        <button
          type="button"
          className={`fe-ldeck__pill fe-ldeck__pill--fan${fan ? ' fe-ldeck__pill--on' : ''}`}
          onClick={() => {
            setFan((v) => !v)
            onFan()
          }}
        >
          ファンになる
        </button>
      </div>
    </section>
  )
}
