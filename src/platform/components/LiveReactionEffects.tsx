import type { CSSProperties } from 'react'
import type { LiveVisualPulse } from '../lib/useLiveReactions'

export function LiveReactionEffects({ pulses, level, celebrating, reducedMotion }: {
  pulses: LiveVisualPulse[]; level: number; celebrating: boolean; reducedMotion: boolean
}) {
  return <div className={`pl-live__effects${reducedMotion ? ' pl-live__effects--calm' : ''}`} aria-hidden="true"
    data-celebrating={celebrating} style={{ '--applause-glow': level / 100 } as CSSProperties}>
    <div className="pl-live__reaction-stream">
      {pulses.map((pulse, index) => <span key={pulse.id} className={`pl-live__reaction-float pl-live__reaction-float--${pulse.kind}`}
        style={{ '--float-offset': `${(index % 5 - 2) * 9}px` } as CSSProperties}>{pulse.kind === 'heart' ? '❤️' : '👏'}</span>)}
    </div>
    {celebrating ? <span className="pl-live__celebration">✨ 👏 ✨</span> : null}
  </div>
}

export function LiveApplauseMeter({ total, level, celebrating }: { total: number; level: number; celebrating: boolean }) {
  return <div className="pl-live__applause" data-celebrating={celebrating}>
    <div className="pl-live__applause-head"><strong>👏 拍手メーター</strong><span>合計 {total.toLocaleString()}</span></div>
    <div className="pl-live__applause-track" role="meter" aria-label="拍手の盛り上がり" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level)}>
      <span style={{ width: `${level}%` }} />
    </div>
  </div>
}
