export function appearanceDates(primary: string, additional: string) {
  const candidates = [primary, ...additional.split(/[\s,、]+/).filter(Boolean)]
  if (candidates.some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
    throw new Error('invalid_appearance_date')
  }
  return [...new Set(candidates)]
}
