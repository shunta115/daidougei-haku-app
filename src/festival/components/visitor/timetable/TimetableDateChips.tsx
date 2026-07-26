type TimetableDateChipsProps = {
  dates: string[]
  value: string
  onChange: (date: string) => void
}

function formatDateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })
}

export function TimetableDateChips({ dates, value, onChange }: TimetableDateChipsProps) {
  return (
    <div className="fe-ttv-dates" role="group" aria-label="日程">
      {dates.map((d) => (
        <button
          key={d}
          type="button"
          className={`fe-ttv-chip fe-ttv-chip--date${value === d ? ' fe-ttv-chip--on' : ''}`}
          aria-pressed={value === d}
          onClick={() => onChange(d)}
        >
          <span className="fe-ttv-chip__sub">{d}</span>
          {formatDateLabel(d)}
        </button>
      ))}
    </div>
  )
}
