/** Convite iCalendar (RFC 5545): aceite por Outlook, Google Calendar e calendários móveis. */

export interface IcsEvent {
  uid: string
  sequence: number
  method: 'REQUEST' | 'CANCEL'
  start: Date
  durationMinutes: number
  summary: string
  description: string
  location: string | null
  organizerEmail: string
  organizerName: string
  attendees: { email: string; name: string }[]
  now?: Date
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Dobra linhas a 75 octetos, como exige a norma. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const charSize = Buffer.byteLength(char, 'utf8')
    const limit = parts.length === 0 ? 75 : 74
    if (size + charSize > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += charSize
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function cleanParam(value: string): string {
  return value.replace(/[";:,\r\n]/g, ' ').trim()
}

export function buildIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AGORAMOZ//AGORAMOZ HR//PT',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${icsDate(event.now ?? new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `ORGANIZER;CN=${cleanParam(event.organizerName)}:mailto:${event.organizerEmail}`,
    ...event.attendees.map((attendee) => `ATTENDEE;CN=${cleanParam(attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${attendee.email}`),
    `STATUS:${event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

export function emailAddressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from
}
