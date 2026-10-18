import { normalizeText } from '@/lib/text'

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g
const ID_NUMBER = /\b\d{12}[A-Z]\b/g

/**
 * Minimização antes de enviar a um fornecedor externo (Blueprint §7.4): remove contactos,
 * números de documento e o nome do candidato. O resumo não precisa de identificar a pessoa.
 */
export function redactForAi(text: string, fullName: string | null): string {
  let result = text
    .replace(EMAIL, '[email]')
    // Só sequências com 9+ dígitos: preserva intervalos de anos como "2019-2023".
    .replace(PHONE, (match) => (match.replace(/\D/g, '').length >= 9 ? '[telefone]' : match))
    .replace(ID_NUMBER, '[documento]')
  for (const part of (fullName ?? '').split(/\s+/).filter((token) => token.length >= 3)) {
    result = result.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[candidato]')
  }
  return result
}

function squash(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Verdadeiro se a citação aparece literalmente no texto (ignorando maiúsculas, acentos e pontuação). */
export function quoteIsGrounded(quote: string, source: string): boolean {
  const needle = squash(quote)
  return needle.length >= 8 && squash(source).includes(needle)
}
