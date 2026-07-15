import type { TimetableScheduleMode } from '../../../lib/timetableConstants'

type TimetableScheduleToggleProps = {
  mode: TimetableScheduleMode
  onChange: (mode: TimetableScheduleMode) => void
}

export function TimetableScheduleToggle({ mode, onChange }: TimetableScheduleToggleProps) {
  const rain = mode === 'rain'
  return (
    <div className="fe-ttv-mode" aria-label="スケジュール種別">
      <div className={`fe-ttv-mode__track${rain ? ' fe-ttv-mode__track--rain' : ''}`}>
        <button
          type="button"
          className={`fe-ttv-mode__btn${!rain ? ' fe-ttv-mode__btn--on' : ''}`}
          aria-pressed={!rain}
          onClick={() => onChange('normal')}
        >
          通常
        </button>
        <button
          type="button"
          className={`fe-ttv-mode__btn${rain ? ' fe-ttv-mode__btn--on' : ''}`}
          aria-pressed={rain}
          onClick={() => onChange('rain')}
        >
          雨天
        </button>
      </div>
      {rain ? (
        <p className="fe-ttv-mode__banner">
          雨天スケジュール表示（デモ）— 中止・遅延・屋内移動の枠を中心に表示
        </p>
      ) : null}
    </div>
  )
}
