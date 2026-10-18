import { describe, expect, it } from 'vitest'
import { buildIcs, escapeText, foldLine } from '@/modules/interviews/ics'

describe('convite iCalendar', () => {
  const ics = buildIcs({
    uid: 'abc@agoramoz-hr',
    sequence: 0,
    method: 'REQUEST',
    start: new Date('2026-10-21T08:00:00Z'),
    durationMinutes: 45,
    summary: 'Entrevista — Fiel de Armazém, Matola; turno A',
    description: 'Linha 1\nLinha 2',
    location: 'Av. das Indústrias, Matola',
    organizerEmail: 'rh@exemplo.test',
    organizerName: 'Demo; Lda',
    attendees: [{ email: 'joana@exemplo.test', name: 'Joana Macuácua' }],
    now: new Date('2026-10-18T10:00:00Z'),
  })

  it('usa CRLF, datas UTC e fim calculado pela duração', () => {
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART:20261021T080000Z')
    expect(ics).toContain('DTEND:20261021T084500Z')
  })

  it('escapa texto e parâmetros', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
    expect(ics).toContain('ORGANIZER;CN=Demo  Lda:mailto:rh@exemplo.test')
  })

  it('dobra linhas longas a 75 octetos sem partir caracteres', () => {
    const folded = foldLine(`DESCRIPTION:${'ç'.repeat(80)}`)
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'ç'.repeat(80)}`)
  })

  it('cancelamento leva METHOD:CANCEL e STATUS:CANCELLED', () => {
    const cancel = buildIcs({ uid: 'x', sequence: 1, method: 'CANCEL', start: new Date(), durationMinutes: 30, summary: 's', description: 'd', location: null, organizerEmail: 'a@b.test', organizerName: 'A', attendees: [] })
    expect(cancel).toContain('METHOD:CANCEL')
    expect(cancel).toContain('STATUS:CANCELLED')
    expect(cancel).toContain('SEQUENCE:1')
  })
})
