import { DEFAULT_TIMEZONE } from './time'

const LOCALE = 'pt-MZ'

export function formatDate(value: Date | string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(LOCALE, { timeZone, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value: Date | string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatTime(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function formatMzn(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Number(value))} MZN`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value)
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value * 100)}%`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
