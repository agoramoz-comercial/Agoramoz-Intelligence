/** Normalização para comparação: minúsculas, sem acentos, espaços simples. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(value: string, maxLength = 60): string {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
  return slug.length >= 3 ? slug : `vaga-${slug || 'nova'}`
}

/** Telefone em formato E.164; números moçambicanos de 9 dígitos (8x) recebem +258. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  if (digits.startsWith('00')) return normalizePhone(`+${digits.slice(2)}`)
  if (digits.length === 9 && /^[82]/.test(digits)) return `+258${digits}`
  if (digits.length === 12 && digits.startsWith('258')) return `+${digits}`
  return null
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}
