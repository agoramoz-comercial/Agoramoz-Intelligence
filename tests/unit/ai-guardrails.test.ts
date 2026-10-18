import { describe, expect, it } from 'vitest'
import { quoteIsGrounded, redactForAi } from '@/modules/ai/redact'

describe('salvaguardas da IA', () => {
  it('remove contactos, documento e nome antes de enviar ao fornecedor', () => {
    const text = 'Joana Macuácua, joana@exemplo.test, +258 84 123 4567, BI 110100123456A. Fiel de armazém (2019-2023).'
    const redacted = redactForAi(text, 'Joana Macuácua')
    expect(redacted).not.toMatch(/joana@|84 123|110100123456A|Joana|Macuácua/i)
    expect(redacted).toContain('(2019-2023)')
    expect(redacted).toContain('[email]')
  })

  it('só aceita citações que existem literalmente no CV (ignorando acentos e pontuação)', () => {
    const cv = 'Fiel de armazém — Distribuidora do Sul, Matola. Carta de condução profissional.'
    expect(quoteIsGrounded('carta de conducao profissional', cv)).toBe(true)
    expect(quoteIsGrounded('Certificação em empilhadores', cv)).toBe(false)
    expect(quoteIsGrounded('Sul', cv)).toBe(false)
  })
})
