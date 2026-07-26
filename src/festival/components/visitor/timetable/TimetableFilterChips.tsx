type Chip = { id: string; labelJa: string; hintJa?: string }

type TimetableFilterChipsProps = {
  label: string
  chips: readonly Chip[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export function TimetableFilterChips({ label, chips, value, onChange, className }: TimetableFilterChipsProps) {
  return (
    <div className={`fe-ttv-filters${className ? ` ${className}` : ''}`}>
      <p className="fe-ttv-filters__label">{label}</p>
      <div className="fe-ttv-filters__row" role="group" aria-label={label}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`fe-ttv-chip${value === c.id ? ' fe-ttv-chip--on' : ''}`}
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            title={c.hintJa}
          >
            {c.labelJa}
          </button>
        ))}
      </div>
    </div>
  )
}
