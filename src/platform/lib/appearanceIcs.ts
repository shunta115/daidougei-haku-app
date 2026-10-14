import type { PerformerAppearance } from './types'

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function utc(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function appearanceToIcs(appearance: PerformerAppearance, performerName = '') {
  const end = appearance.ends_at ?? new Date(Date.parse(appearance.starts_at) + 60 * 60 * 1000).toISOString()
  const description = [performerName, appearance.description, appearance.admission_details, appearance.ticket_url].filter(Boolean).join('\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HAKU//Appearance//JA', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${appearance.id}@daidougei-haku-app.vercel.app`, `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(appearance.starts_at)}`, `DTEND:${utc(end)}`, `SUMMARY:${escapeIcs(appearance.title)}`,
    `LOCATION:${escapeIcs([appearance.venue_name, appearance.venue_address].filter(Boolean).join(' '))}`,
    `DESCRIPTION:${escapeIcs(description)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n')
}

export function downloadAppearanceIcs(appearance: PerformerAppearance, performerName = '') {
  const blob = new Blob([appearanceToIcs(appearance, performerName)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `haku-${appearance.performance_date}-${appearance.id.slice(0, 8)}.ics`
  anchor.click()
  URL.revokeObjectURL(url)
}
