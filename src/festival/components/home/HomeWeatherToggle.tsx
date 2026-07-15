import type { TimetableScheduleMode } from '../../lib/timetableConstants'

type HomeWeatherToggleProps = {
  mode: TimetableScheduleMode
  onChange: (mode: TimetableScheduleMode) => void
}

export function HomeWeatherToggle({ mode, onChange }: HomeWeatherToggleProps) {
  const rain = mode === 'rain'
  return (
    <section className="fe-h6-weather" aria-label="開催モード">
      <p className="fe-h6-weather__k">開催モード</p>
      <div className={`fe-h6-weather__track${rain ? ' fe-h6-weather__track--rain' : ''}`}>
        <button
          type="button"
          className={`fe-h6-weather__btn${!rain ? ' fe-h6-weather__btn--on' : ''}`}
          aria-pressed={!rain}
          onClick={() => onChange('normal')}
        >
          ☀ 通常開催
        </button>
        <button
          type="button"
          className={`fe-h6-weather__btn${rain ? ' fe-h6-weather__btn--on' : ''}`}
          aria-pressed={rain}
          onClick={() => onChange('rain')}
        >
          ☂ 雨天対応
        </button>
      </div>
      {rain ? (
        <p className="fe-h6-weather__note">屋内移動・遅延・中止枠を強調表示（デモ）</p>
      ) : (
        <p className="fe-h6-weather__note">屋外ステージは通常どおり。変更はリアルタイム反映（デモ）</p>
      )}
    </section>
  )
}
