export const DEFAULT_TIMEZONE = 'Africa/Maputo'

/** Diferença (ms) entre a hora local do fuso e UTC num dado instante. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))
  return asUtc - instant.getTime()
}

/** Converte "AAAA-MM-DDTHH:mm" (hora de parede no fuso da organização) para um instante UTC. */
export function zonedLocalToUtc(local: string, timeZone = DEFAULT_TIMEZONE): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!match) throw new Error('Data/hora inválida')
  const [, y, m, d, hh, mm] = match.map(Number) as [number, number, number, number, number, number]
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const offset = zoneOffsetMs(new Date(guess), timeZone)
  return new Date(guess - offset)
}

/** Formato "AAAA-MM-DDTHH:mm" no fuso indicado, para preencher <input type="datetime-local">. */
export function utcToZonedLocal(instant: Date, timeZone = DEFAULT_TIMEZONE): string {
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone))
  return shifted.toISOString().slice(0, 16)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

/** Sugestão de horário para nova entrevista: amanhã às 10:00 de Maputo (08:00 UTC). */
export function suggestedInterviewSlot(now: Date = new Date()): string {
  const slot = new Date(now.getTime() + 86_400_000)
  slot.setUTCHours(8, 0, 0, 0)
  return utcToZonedLocal(slot)
}
