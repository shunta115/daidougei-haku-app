export function appearanceDates(primary: string, additional: string) {
  const candidates = [primary, ...additional.split(/[\s,、]+/)]
  return [...new Set(candidates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))]
}
