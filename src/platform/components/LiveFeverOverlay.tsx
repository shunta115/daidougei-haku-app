import type { CSSProperties } from 'react'
import type { LiveFeverHeart } from '../lib/useLiveFever'

export function LiveFeverOverlay({ level, likes, hearts, reducedMotion }: {
  level: number
  likes: number
  hearts: LiveFeverHeart[]
  reducedMotion: boolean
}) {
  return <div className={`pl-fever${reducedMotion ? ' pl-fever--calm' : ''}`}>
    <div className="pl-fever__meter">
      <div className="pl-fever__label"><strong>HAKU FEVER</strong><span>この視聴中 ♥ {likes}</span></div>
      <div className="pl-fever__track" role="meter" aria-label="HAKU FEVER 盛り上がりメーター" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level)}>
        <span style={{ width: `${level}%` }} />
      </div>
    </div>
    <div className="pl-fever__hearts" aria-hidden="true">
      {hearts.map((heart, index) => <span key={heart.id} style={{ '--fever-offset': `${(index % 5 - 2) * 10}px` } as CSSProperties}>♥</span>)}
    </div>
  </div>
}
